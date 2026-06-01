import { DECIMALS, MINT, PROGRAM_ID } from "@kairo/sdk";
import { gtfa, rpcUrl, txDeltas, TX_LIMIT } from "./helius";

const WSOL = "So11111111111111111111111111111111111111112";
const KAIRO = MINT.toBase58();
const PID = PROGRAM_ID.toBase58();
const LAMPORTS = 1e9;
const INIT_LAMPORTS = 100_000_000;
const TOPOFF_LAMPORTS = 20_000_000;
const DENOM_TOL = 2_000_000;

const PAGE_TIMEOUT_MS = 15_000;
const SCAN_BUDGET_MS = 120_000; // generous — runs in the background, not on a request
const MAX_PAGES = 80;
const SERIES_DAYS = 60;
const SERIES_HOURS = 48;
const MIN_BUYBACK_SOL = 0.001;

export interface SeriesPoint {
  t: string; // bucket label: YYYY-MM-DD (daily) or YYYY-MM-DDTHH (hourly), UTC
  feesSol: number;
  buybackSol: number;
  kairoBurned: number;
}
export type DailyPoint = SeriesPoint;

export interface ProtocolMetrics {
  devWallet: string;
  feesSol: number;
  initCount: number;
  topoffCount: number;
  buybackSol: number;
  kairoBought: number;
  kairoBurned: number;
  buybackTxs: number;
  burnTxs: number;
  currentSupply: number;
  lastBuybackTs: number | null;
  lastBurnTs: number | null;
  daily: SeriesPoint[]; // last SERIES_DAYS days, ascending
  hourly: SeriesPoint[]; // last SERIES_HOURS hours, ascending
  txScanned: number;
  capped: boolean;
  updatedAt: number;
}

let current: ProtocolMetrics | null = null;
let inflight: Promise<ProtocolMetrics> | null = null;
let feedStarted = false;

async function getMintSupply(url: string): Promise<number> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getTokenSupply", params: [KAIRO] }),
      signal: AbortSignal.timeout(8_000),
    });
    const v: any = (await res.json())?.result?.value;
    if (v?.uiAmount != null) return Number(v.uiAmount);
    if (v?.uiAmountString != null) return Number(v.uiAmountString);
    if (v?.amount != null) return Number(v.amount) / 10 ** (Number(v.decimals) || DECIMALS);
  } catch {
    /* ignore */
  }
  return current?.currentSupply ?? 0;
}

function burnedKairoRaw(tx: any): bigint {
  let total = 0n;
  const scan = (instrs: any[] | undefined) => {
    for (const ix of instrs ?? []) {
      const p = ix?.parsed;
      if (!p || (p.type !== "burn" && p.type !== "burnChecked")) continue;
      if (p.info?.mint !== KAIRO) continue;
      try {
        if (p.info.tokenAmount?.amount != null) total += BigInt(p.info.tokenAmount.amount);
        else if (p.info.amount != null) total += BigInt(p.info.amount);
      } catch {
        /* skip */
      }
    }
  };
  scan(tx?.transaction?.message?.instructions);
  for (const inner of tx?.meta?.innerInstructions ?? []) scan(inner.instructions);
  return total;
}

function touchesProgram(tx: any): boolean {
  for (const ix of tx?.transaction?.message?.instructions ?? []) {
    if (ix?.programId === PID) return true;
  }
  return false;
}

const dayOf = (ts: number) => new Date(ts * 1000).toISOString().slice(0, 10);
const hourOf = (ts: number) => new Date(ts * 1000).toISOString().slice(0, 13);

/** Full treasury-history scan → cumulative protocol metrics + daily series. */
async function scanMetrics(apiKey: string, devWallet: string, cluster: "mainnet" | "devnet"): Promise<ProtocolMetrics> {
  const url = rpcUrl(cluster, apiKey);
  const deadline = Date.now() + SCAN_BUDGET_MS;
  const dayCutoff = Math.floor(Date.now() / 1000) - SERIES_DAYS * 86_400;
  const hourCutoff = Math.floor(Date.now() / 1000) - SERIES_HOURS * 3600;

  let feesSol = 0,
    initCount = 0,
    topoffCount = 0,
    buybackSol = 0,
    kairoBought = 0,
    buybackTxs = 0,
    burnTxs = 0,
    txScanned = 0;
  let burnedRaw = 0n;
  let lastBuybackTs: number | null = null;
  let lastBurnTs: number | null = null;
  let capped = false;
  let token: string | null = null;

  const dayBuckets = new Map<string, SeriesPoint>();
  const hourBuckets = new Map<string, SeriesPoint>();
  const into = (
    map: Map<string, SeriesPoint>,
    t: string,
    key: "feesSol" | "buybackSol" | "kairoBurned",
    v: number,
  ) => {
    let b = map.get(t);
    if (!b) map.set(t, (b = { t, feesSol: 0, buybackSol: 0, kairoBurned: 0 }));
    b[key] += v;
  };
  const bump = (ts: number, key: "feesSol" | "buybackSol" | "kairoBurned", v: number) => {
    if (ts >= dayCutoff) into(dayBuckets, dayOf(ts), key, v);
    if (ts >= hourCutoff) into(hourBuckets, hourOf(ts), key, v);
  };

  for (let page = 0; page < MAX_PAGES; page++) {
    if (Date.now() > deadline) {
      capped = true;
      break;
    }
    const opts: Record<string, unknown> = {
      transactionDetails: "full",
      encoding: "jsonParsed",
      maxSupportedTransactionVersion: 0,
      sortOrder: "desc",
      limit: TX_LIMIT,
      filters: { status: "succeeded" },
    };
    if (token) opts.paginationToken = token;

    const r: any = await gtfa(url, devWallet, opts, PAGE_TIMEOUT_MS);
    const data: any[] = r?.data ?? [];

    for (const tx of data) {
      txScanned++;
      const ts = Number(tx.blockTime) || 0;
      const { solDelta, tokenDelta } = txDeltas(tx, devWallet);

      if (solDelta > 0 && touchesProgram(tx)) {
        const lam = Math.round(solDelta);
        feesSol += solDelta / LAMPORTS;
        if (Math.abs(lam - INIT_LAMPORTS) < DENOM_TOL) initCount++;
        else if (Math.abs(lam - TOPOFF_LAMPORTS) < DENOM_TOL) topoffCount++;
        bump(ts, "feesSol", solDelta / LAMPORTS);
      }

      const b = burnedKairoRaw(tx);
      if (b > 0n) {
        burnedRaw += b;
        burnTxs++;
        if (ts && (lastBurnTs === null || ts > lastBurnTs)) lastBurnTs = ts;
        bump(ts, "kairoBurned", Number(b) / 10 ** DECIMALS);
      }

      const kairoDelta = tokenDelta.get(KAIRO) ?? 0;
      if (kairoDelta > 1e-9) {
        const wsolDelta = tokenDelta.get(WSOL) ?? 0;
        const spent = Math.max(solDelta < 0 ? -solDelta / LAMPORTS : 0, wsolDelta < 0 ? -wsolDelta : 0);
        if (spent >= MIN_BUYBACK_SOL) {
          buybackSol += spent;
          kairoBought += kairoDelta;
          buybackTxs++;
          if (ts && (lastBuybackTs === null || ts > lastBuybackTs)) lastBuybackTs = ts;
          bump(ts, "buybackSol", spent);
        }
      }
    }

    token = r?.paginationToken ?? null;
    if (!token || data.length < TX_LIMIT) break;
    if (page === MAX_PAGES - 1) capped = true;
  }

  const now = Math.floor(Date.now() / 1000);
  const zero = (t: string): SeriesPoint => ({ t, feesSol: 0, buybackSol: 0, kairoBurned: 0 });
  const daily: SeriesPoint[] = [];
  for (let i = SERIES_DAYS - 1; i >= 0; i--) {
    const t = dayOf(now - i * 86_400);
    daily.push(dayBuckets.get(t) ?? zero(t));
  }
  const hourly: SeriesPoint[] = [];
  for (let i = SERIES_HOURS - 1; i >= 0; i--) {
    const t = hourOf(now - i * 3600);
    hourly.push(hourBuckets.get(t) ?? zero(t));
  }

  return {
    devWallet,
    feesSol,
    initCount,
    topoffCount,
    buybackSol,
    kairoBought,
    kairoBurned: Number(burnedRaw) / 10 ** DECIMALS,
    buybackTxs,
    burnTxs,
    currentSupply: await getMintSupply(url),
    lastBuybackTs,
    lastBurnTs,
    daily,
    hourly,
    txScanned,
    capped,
    updatedAt: Date.now(),
  };
}

/** Refresh the cached metrics (single-flight). Keeps last-good on error. */
async function refreshMetrics(apiKey: string, devWallet: string, cluster: "mainnet" | "devnet"): Promise<ProtocolMetrics> {
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      current = await scanMetrics(apiKey, devWallet, cluster);
    } catch {
      // keep last-good
    } finally {
      inflight = null;
    }
    return current as ProtocolMetrics;
  })();
  return inflight;
}

/**
 * Background metrics indexer. Runs a full treasury-history scan off the request
 * path (it can take ~a minute as history grows), so /metrics, /buyback and
 * /defillama all serve an instant, warm result. Idempotent.
 */
export function startMetricsFeed(
  apiKey: string,
  devWallet: string,
  cluster: "mainnet" | "devnet",
  intervalMs = 300_000,
): void {
  if (feedStarted) return;
  feedStarted = true;
  void refreshMetrics(apiKey, devWallet, cluster);
  setInterval(() => void refreshMetrics(apiKey, devWallet, cluster), intervalMs);
  console.log(`[metrics] background indexer enabled — refreshing every ${intervalMs / 1000}s`);
}

/** Cached protocol metrics. Triggers a one-off scan only if nothing is cached yet. */
export async function getProtocolMetrics(
  apiKey: string,
  devWallet: string,
  cluster: "mainnet" | "devnet" = "mainnet",
): Promise<ProtocolMetrics> {
  if (current) return current;
  return refreshMetrics(apiKey, devWallet, cluster);
}
