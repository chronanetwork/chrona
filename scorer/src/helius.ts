import { AGE_CAP_DAYS, MIN_TRADE_USD } from "@kairo/sdk";
import type { WalletActivity } from "./score";
import { getSolPriceUsd } from "./pricing";

// Quote assets we can price directly.
const WSOL = "So11111111111111111111111111111111111111112";
const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const USDT = "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB";
const STABLES = new Set([USDC, USDT]);
const QUOTE = new Set([WSOL, USDC, USDT]);

const TX_LIMIT = 1000; // gTFA returns up to 1000 full txs per call
const SHORT_TIMEOUT_MS = 8_000;
const FULL_TIMEOUT_MS = 15_000; // full-transaction payloads are larger

export interface MeasureOptions {
  apiKey: string;
  /** "mainnet" (default — wallets are scored on mainnet activity) or "devnet". */
  cluster?: "mainnet" | "devnet";
  /** Max pages of full transactions to scan for trades/volume/hold. */
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
  txScanned: number;
  swapsScanned: number;
  capped: { transactions: boolean };
}

function rpcUrl(cluster: string, apiKey: string): string {
  const host = cluster === "devnet" ? "devnet" : "mainnet";
  return `https://${host}.helius-rpc.com/?api-key=${apiKey}`;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** POST JSON-RPC with a per-request timeout and one retry on 429/5xx. */
async function rpc(url: string, method: string, params: unknown[], timeoutMs: number): Promise<any> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (res.status === 429 || res.status >= 500) {
        lastErr = new Error(`HTTP ${res.status}`);
        await sleep(400);
        continue;
      }
      const json = await res.json();
      if (json.error) throw new Error(`${method}: ${JSON.stringify(json.error)}`);
      return json.result;
    } catch (e) {
      lastErr = e;
      await sleep(300);
    }
  }
  throw lastErr ?? new Error("request failed");
}

/** Helius getTransactionsForAddress. */
function gtfa(url: string, address: string, opts: Record<string, unknown>, timeoutMs: number) {
  return rpc(url, "getTransactionsForAddress", [address, opts], timeoutMs);
}

/**
 * Net SOL (lamports) and per-mint token deltas for `wallet` in one full tx,
 * derived from balance metadata — robust across every DEX program.
 */
/** UI token amount, robust to `uiAmount` being null (common in gTFA). */
function uiAmount(b: any): number {
  const u = b?.uiTokenAmount;
  if (!u) return 0;
  if (u.uiAmount != null) return Number(u.uiAmount);
  if (u.uiAmountString != null) return Number(u.uiAmountString);
  const raw = Number(u.amount) || 0;
  const dec = Number(u.decimals) || 0;
  return raw / 10 ** dec;
}

function txDeltas(entry: any, wallet: string) {
  const meta = entry.meta;
  const msg = entry.transaction?.message;
  const tokenDelta = new Map<string, number>();
  let solDelta = 0;
  if (!meta) return { solDelta, tokenDelta };

  // Native SOL: locate the wallet across static + loaded (v0) account keys.
  const staticKeys = (msg?.accountKeys ?? []).map((k: any) => (typeof k === "string" ? k : k.pubkey));
  const loaded = meta.loadedAddresses;
  const keys = [...staticKeys, ...(loaded?.writable ?? []), ...(loaded?.readonly ?? [])];
  const idx = keys.indexOf(wallet);
  if (idx >= 0 && meta.preBalances && meta.postBalances) {
    solDelta = (Number(meta.postBalances[idx]) || 0) - (Number(meta.preBalances[idx]) || 0);
  }

  // Token balances carry `owner` directly (post Dec-2022). Match pre/post by accountIndex.
  const pre = new Map<number, any>();
  for (const b of meta.preTokenBalances ?? []) if (b.owner === wallet) pre.set(b.accountIndex, b);
  for (const b of meta.postTokenBalances ?? []) {
    if (b.owner !== wallet) continue;
    const prev = pre.get(b.accountIndex);
    const delta = uiAmount(b) - (prev ? uiAmount(prev) : 0);
    tokenDelta.set(b.mint, (tokenDelta.get(b.mint) ?? 0) + delta);
    pre.delete(b.accountIndex);
  }
  // Accounts present pre but not post (closed to zero).
  for (const [, b] of pre) {
    tokenDelta.set(b.mint, (tokenDelta.get(b.mint) ?? 0) - uiAmount(b));
  }
  return { solDelta, tokenDelta };
}

/**
 * Measure a wallet's mainnet activity for scoring using Helius
 * `getTransactionsForAddress`: one call for age (oldest tx), then bounded pages
 * of full, token-account-aware (`balanceChanged`) transactions for
 * trades/volume/hold. Swaps are detected from real balance deltas (a quote leg
 * moving opposite a non-quote token), valuing each by its quote leg. Per-request
 * timeouts + an overall budget guarantee a bounded response time.
 */
export async function measureWallet(
  address: string,
  options: MeasureOptions,
): Promise<Measurement> {
  const cluster = options.cluster ?? "mainnet";
  const url = rpcUrl(cluster, options.apiKey);
  const nowSecs = options.nowSecs ?? Math.floor(Date.now() / 1000);
  const maxTxPages = options.maxTxPages ?? 2;
  const deadline = Date.now() + (options.budgetMs ?? 20_000);

  // Age (oldest tx) + recent full activity + SOL price, concurrently.
  const oldestPromise = gtfa(
    url,
    address,
    { transactionDetails: "signatures", sortOrder: "asc", limit: 1, maxSupportedTransactionVersion: 0 },
    SHORT_TIMEOUT_MS,
  )
    .then((r: any) => r?.data?.[0] ?? null)
    .catch(() => null);

  const activityPromise = (async () => {
    const txs: any[] = [];
    let token: string | null = null;
    let capped = false;
    for (let page = 0; page < maxTxPages; page++) {
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
        filters: { status: "succeeded", tokenAccounts: "balanceChanged" },
      };
      if (token) opts.paginationToken = token;
      const r: any = await gtfa(url, address, opts, FULL_TIMEOUT_MS);
      const data: any[] = r?.data ?? [];
      txs.push(...data);
      token = r?.paginationToken ?? null;
      if (!token || data.length < TX_LIMIT) break;
      if (page === maxTxPages - 1) capped = true;
    }
    return { txs, capped };
  })();

  const solPricePromise =
    options.solPriceUsd !== undefined ? Promise.resolve(options.solPriceUsd) : getSolPriceUsd();

  const [oldestEntry, activity, solPriceUsd] = await Promise.all([
    oldestPromise,
    activityPromise,
    solPricePromise,
  ]);

  // A first tx with no blockTime predates reliable archival → the wallet is
  // ancient, so age maxes out. No first tx at all → unused wallet, age 0.
  const oldestTs: number | null = oldestEntry?.blockTime ?? null;
  const ageDays = oldestTs
    ? Math.max(0, (nowSecs - oldestTs) / 86_400)
    : oldestEntry
      ? AGE_CAP_DAYS
      : 0;

  // Walk chronologically for hold-time tracking.
  const txs = activity.txs.sort((a, b) => (a.blockTime ?? 0) - (b.blockTime ?? 0));

  let nTrades = 0;
  let usdVolume = 0;
  let swapsScanned = 0;
  const openTs = new Map<string, number>();
  const holdDurations: number[] = [];

  for (const tx of txs) {
    const ts = Number(tx.blockTime) || nowSecs;
    const { solDelta, tokenDelta } = txDeltas(tx, address);

    // Quote-leg value (USD) and whether quote was spent or received.
    let quoteUsd = 0;
    let quoteSpent = false;
    let quoteReceived = false;
    const solUsd = (Math.abs(solDelta) / 1e9) * solPriceUsd;
    if (solUsd > 0) {
      quoteUsd = Math.max(quoteUsd, solUsd);
      if (solDelta < 0) quoteSpent = true;
      else if (solDelta > 0) quoteReceived = true;
    }
    for (const [mint, d] of tokenDelta) {
      if (!QUOTE.has(mint)) continue;
      const v = mint === WSOL ? Math.abs(d) * solPriceUsd : Math.abs(d);
      quoteUsd = Math.max(quoteUsd, v);
      if (d < 0) quoteSpent = true;
      else if (d > 0) quoteReceived = true;
    }

    // Non-quote token legs.
    let boughtMint: string | null = null;
    let soldMint: string | null = null;
    for (const [mint, d] of tokenDelta) {
      if (QUOTE.has(mint) || Math.abs(d) < 1e-9) continue;
      if (d > 0) boughtMint = mint;
      else soldMint = mint;
    }

    const isBuy = quoteSpent && boughtMint !== null;
    const isSell = quoteReceived && soldMint !== null;
    if ((!isBuy && !isSell) || quoteUsd < MIN_TRADE_USD) continue;

    swapsScanned++;
    nTrades++;
    usdVolume += quoteUsd;

    if (isBuy && boughtMint && !openTs.has(boughtMint)) openTs.set(boughtMint, ts);
    if (isSell && soldMint && openTs.has(soldMint)) {
      holdDurations.push(Math.max(0, (ts - (openTs.get(soldMint) as number)) / 86_400));
      openTs.delete(soldMint);
    }
  }

  // Still-open bought positions count toward hold time (acquisition → now).
  for (const [, ts] of openTs) {
    holdDurations.push(Math.max(0, (nowSecs - ts) / 86_400));
  }

  return {
    ageDays,
    nTrades,
    usdVolume,
    medianHoldDays: median(holdDurations),
    solPriceUsd,
    oldestTs,
    txScanned: txs.length,
    swapsScanned,
    capped: { transactions: activity.capped },
  };
}

function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}
