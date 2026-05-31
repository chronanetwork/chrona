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

export interface MeasureOptions {
  /** Helius API key. */
  apiKey: string;
  /** "mainnet" (default — wallets are scored on mainnet activity) or "devnet". */
  cluster?: "mainnet" | "devnet";
  /** Max signature pages to scan for wallet age (each page = 1000). */
  maxSigPages?: number;
  /** Max enhanced-transaction pages to scan for trades (each page = 100). */
  maxTxPages?: number;
  /** Override SOL/USD (pins pricing for reproducibility). */
  solPriceUsd?: number;
  /** "now" timestamp (seconds) for age/hold; defaults to wall clock. */
  nowSecs?: number;
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

async function rpc(url: string, method: string, params: unknown[]): Promise<any> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const json = await res.json();
  if (json.error) throw new Error(`${method}: ${JSON.stringify(json.error)}`);
  return json.result;
}

/** Scan signatures to find the wallet's earliest transaction timestamp. */
async function findOldestTs(
  url: string,
  address: string,
  maxPages: number,
): Promise<{ oldestTs: number | null; scanned: number; capped: boolean }> {
  let before: string | undefined;
  let oldestTs: number | null = null;
  let scanned = 0;
  for (let page = 0; page < maxPages; page++) {
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
 * Measure a wallet's activity for scoring. Bounded by `maxSigPages` /
 * `maxTxPages`; if a wallet exceeds the cap, age and trades are based on the
 * scanned window (flagged in `capped`). Pricing values each swap by its quote
 * leg (SOL at `solPriceUsd`, stables at $1), so no per-token price feed is
 * needed.
 */
export async function measureWallet(
  address: string,
  options: MeasureOptions,
): Promise<Measurement> {
  const cluster = options.cluster ?? "mainnet";
  const url = rpcUrl(cluster, options.apiKey);
  const nowSecs = options.nowSecs ?? Math.floor(Date.now() / 1000);
  const solPriceUsd = options.solPriceUsd ?? (await getSolPriceUsd());
  const maxSigPages = options.maxSigPages ?? 10;
  const maxTxPages = options.maxTxPages ?? 10;

  const { oldestTs, scanned, capped: sigCapped } = await findOldestTs(
    url,
    address,
    maxSigPages,
  );
  const ageDays = oldestTs ? Math.max(0, (nowSecs - oldestTs) / 86_400) : 0;

  // Fetch enhanced (parsed) transactions, newest first.
  const txs: any[] = [];
  let before: string | undefined;
  let txCapped = false;
  for (let page = 0; page < maxTxPages; page++) {
    const u = new URL(`https://api.helius.xyz/v0/addresses/${address}/transactions`);
    u.searchParams.set("api-key", options.apiKey);
    u.searchParams.set("limit", String(TX_PAGE));
    if (before) u.searchParams.set("before", before);
    const res = await fetch(u);
    const page_txs: any[] = await res.json();
    if (!Array.isArray(page_txs) || page_txs.length === 0) break;
    txs.push(...page_txs);
    before = page_txs[page_txs.length - 1].signature;
    if (page_txs.length < TX_PAGE) break;
    if (page === maxTxPages - 1) txCapped = true;
  }

  // Process chronologically for hold-time tracking.
  txs.sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0));

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

    // Quote-leg notional (USD).
    let quoteUsd = 0;
    const solUsd = (Math.abs(solDelta) / 1e9) * solPriceUsd;
    quoteUsd = Math.max(quoteUsd, solUsd);
    for (const [mint, d] of tokenDelta) {
      if (mint === WSOL) quoteUsd = Math.max(quoteUsd, Math.abs(d) * solPriceUsd);
      else if (STABLES.has(mint)) quoteUsd = Math.max(quoteUsd, Math.abs(d));
    }
    if (quoteUsd < MIN_TRADE_USD) continue;

    nTrades++;
    usdVolume += quoteUsd;

    // Buy/sell direction for the non-quote token.
    const quoteSpent = solDelta < 0 || isQuoteSpent(tokenDelta);
    for (const [mint, d] of tokenDelta) {
      if (mint === WSOL || STABLES.has(mint)) continue;
      if (d > 0 && quoteSpent) {
        // bought
        if (!openTs.has(mint)) openTs.set(mint, ts);
      } else if (d < 0 && openTs.has(mint)) {
        // sold (close)
        const days = Math.max(0, (ts - (openTs.get(mint) as number)) / 86_400);
        holdDurations.push(days);
        openTs.delete(mint);
      }
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
    totalSignaturesScanned: scanned,
    swapsScanned,
    capped: { signatures: sigCapped, transactions: txCapped },
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
