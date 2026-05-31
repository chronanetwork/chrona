import { MIN_TRADE_USD } from "@kairo/sdk";
import type { WalletActivity } from "./score";
import { getSolPriceUsd } from "./pricing";

// Quote assets we can price directly.
const WSOL = "So11111111111111111111111111111111111111112";
const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const USDT = "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB";
const STABLES = new Set([USDC, USDT]);

const SIG_PAGE = 1000;
const TX_PAGE = 100;
const REQUEST_TIMEOUT_MS = 8000;

export interface MeasureOptions {
  apiKey: string;
  /** "mainnet" (default — wallets are scored on mainnet activity) or "devnet". */
  cluster?: "mainnet" | "devnet";
  maxSigPages?: number;
  maxTxPages?: number;
  /** Override SOL/USD (pins pricing for reproducibility). */
  solPriceUsd?: number;
  /** "now" timestamp (seconds) for age/hold; defaults to wall clock. */
  nowSecs?: number;
  /** Hard wall-clock budget; pagination stops (flagged capped) past it. */
  budgetMs?: number;
}

export interface Measurement extends WalletActivity {
  solPriceUsd: number;
  oldestTs: number | null;
  totalSignaturesScanned: number;
  swapsScanned: number;
  capped: { signatures: boolean; transactions: boolean };
}

function rpcUrl(cluster: string, apiKey: string): string {
  const host = cluster === "devnet" ? "devnet" : "mainnet";
  return `https://${host}.helius-rpc.com/?api-key=${apiKey}`;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** fetch + parse JSON with a per-request timeout and one retry on failure. */
async function fetchJson(url: string, init: RequestInit = {}): Promise<any> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url, { ...init, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
      if (res.status === 429 || res.status >= 500) {
        lastErr = new Error(`HTTP ${res.status}`);
        await sleep(400);
        continue;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      lastErr = e;
      await sleep(300);
    }
  }
  throw lastErr ?? new Error("request failed");
}

async function rpc(url: string, method: string, params: unknown[]): Promise<any> {
  const json = await fetchJson(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  if (json.error) throw new Error(`${method}: ${JSON.stringify(json.error)}`);
  return json.result;
}

/** Scan signatures to find the wallet's earliest transaction timestamp. */
async function findOldestTs(
  url: string,
  address: string,
  maxPages: number,
  deadline: number,
): Promise<{ oldestTs: number | null; scanned: number; capped: boolean }> {
  let before: string | undefined;
  let oldestTs: number | null = null;
  let scanned = 0;
  for (let page = 0; page < maxPages; page++) {
    if (Date.now() > deadline) return { oldestTs, scanned, capped: true };
    const opts: Record<string, unknown> = { limit: SIG_PAGE };
    if (before) opts.before = before;
    const sigs: any[] = await rpc(url, "getSignaturesForAddress", [address, opts]);
    if (!sigs.length) return { oldestTs, scanned, capped: false };
    scanned += sigs.length;
    const last = sigs[sigs.length - 1];
    if (typeof last.blockTime === "number") oldestTs = last.blockTime;
    before = last.signature;
    if (sigs.length < SIG_PAGE) return { oldestTs, scanned, capped: false };
  }
  return { oldestTs, scanned, capped: true };
}

/** Fetch parsed (enhanced) transactions, newest first, bounded by pages/deadline. */
async function fetchEnhanced(
  apiKey: string,
  address: string,
  maxPages: number,
  deadline: number,
): Promise<{ txs: any[]; capped: boolean }> {
  const txs: any[] = [];
  let before: string | undefined;
  let capped = false;
  for (let page = 0; page < maxPages; page++) {
    if (Date.now() > deadline) {
      capped = true;
      break;
    }
    const u = new URL(`https://api.helius.xyz/v0/addresses/${address}/transactions`);
    u.searchParams.set("api-key", apiKey);
    u.searchParams.set("limit", String(TX_PAGE));
    if (before) u.searchParams.set("before", before);
    const page_txs: any[] = await fetchJson(u.toString());
    if (!Array.isArray(page_txs) || page_txs.length === 0) break;
    txs.push(...page_txs);
    before = page_txs[page_txs.length - 1].signature;
    if (page_txs.length < TX_PAGE) break;
    if (page === maxPages - 1) capped = true;
  }
  return { txs, capped };
}

/** Net per-mint and native-SOL deltas for `wallet` within one enhanced tx. */
function txDeltas(tx: any, wallet: string) {
  const tokenDelta = new Map<string, number>();
  let solDelta = 0; // lamports
  for (const t of tx.tokenTransfers ?? []) {
    const amt = Number(t.tokenAmount) || 0;
    if (t.toUserAccount === wallet) tokenDelta.set(t.mint, (tokenDelta.get(t.mint) ?? 0) + amt);
    if (t.fromUserAccount === wallet) tokenDelta.set(t.mint, (tokenDelta.get(t.mint) ?? 0) - amt);
  }
  for (const n of tx.nativeTransfers ?? []) {
    const amt = Number(n.amount) || 0;
    if (n.toUserAccount === wallet) solDelta += amt;
    if (n.fromUserAccount === wallet) solDelta -= amt;
  }
  return { tokenDelta, solDelta };
}

/**
 * Measure a wallet's activity for scoring. Runs the signature scan, the
 * enhanced-transaction scan, and the SOL price fetch concurrently, each with
 * per-request timeouts, and stops paging once `budgetMs` elapses (flagging
 * `capped`). It therefore always returns within roughly the budget rather than
 * hanging. Each swap is valued by its quote leg (SOL at `solPriceUsd`, stables
 * at $1), so no per-token price feed is needed.
 */
export async function measureWallet(
  address: string,
  options: MeasureOptions,
): Promise<Measurement> {
  const cluster = options.cluster ?? "mainnet";
  const url = rpcUrl(cluster, options.apiKey);
  const nowSecs = options.nowSecs ?? Math.floor(Date.now() / 1000);
  const maxSigPages = options.maxSigPages ?? 5;
  const maxTxPages = options.maxTxPages ?? 5;
  const deadline = Date.now() + (options.budgetMs ?? 20_000);

  // Independent — run concurrently.
  const [sig, enhanced, solPriceUsd] = await Promise.all([
    findOldestTs(url, address, maxSigPages, deadline),
    fetchEnhanced(options.apiKey, address, maxTxPages, deadline),
    options.solPriceUsd !== undefined
      ? Promise.resolve(options.solPriceUsd)
      : getSolPriceUsd(),
  ]);

  const ageDays = sig.oldestTs ? Math.max(0, (nowSecs - sig.oldestTs) / 86_400) : 0;

  // Process chronologically for hold-time tracking.
  const txs = enhanced.txs.sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0));

  let nTrades = 0;
  let usdVolume = 0;
  let swapsScanned = 0;
  const openTs = new Map<string, number>(); // mint -> acquisition ts of open position
  const holdDurations: number[] = []; // days

  for (const tx of txs) {
    const isSwap = tx.type === "SWAP" || tx.events?.swap;
    if (!isSwap) continue;
    swapsScanned++;
    const ts = Number(tx.timestamp) || nowSecs;
    const { tokenDelta, solDelta } = txDeltas(tx, address);

    let quoteUsd = (Math.abs(solDelta) / 1e9) * solPriceUsd;
    for (const [mint, d] of tokenDelta) {
      if (mint === WSOL) quoteUsd = Math.max(quoteUsd, Math.abs(d) * solPriceUsd);
      else if (STABLES.has(mint)) quoteUsd = Math.max(quoteUsd, Math.abs(d));
    }
    if (quoteUsd < MIN_TRADE_USD) continue;

    nTrades++;
    usdVolume += quoteUsd;

    const quoteSpent = solDelta < 0 || isQuoteSpent(tokenDelta);
    for (const [mint, d] of tokenDelta) {
      if (mint === WSOL || STABLES.has(mint)) continue;
      if (d > 0 && quoteSpent) {
        if (!openTs.has(mint)) openTs.set(mint, ts);
      } else if (d < 0 && openTs.has(mint)) {
        const days = Math.max(0, (ts - (openTs.get(mint) as number)) / 86_400);
        holdDurations.push(days);
        openTs.delete(mint);
      }
    }
  }

  for (const [, ts] of openTs) {
    holdDurations.push(Math.max(0, (nowSecs - ts) / 86_400));
  }

  return {
    ageDays,
    nTrades,
    usdVolume,
    medianHoldDays: median(holdDurations),
    solPriceUsd,
    oldestTs: sig.oldestTs,
    totalSignaturesScanned: sig.scanned,
    swapsScanned,
    capped: { signatures: sig.capped, transactions: enhanced.capped },
  };
}

function isQuoteSpent(tokenDelta: Map<string, number>): boolean {
  for (const [mint, d] of tokenDelta) {
    if ((mint === WSOL || STABLES.has(mint)) && d < 0) return true;
  }
  return false;
}

function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}
