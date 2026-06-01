import { DECIMALS, MINT } from "@kairo/sdk";
import { gtfa, rpcUrl, txDeltas, TX_LIMIT } from "./helius";

const WSOL = "So11111111111111111111111111111111111111112";
const KAIRO = MINT.toBase58();

const PAGE_TIMEOUT_MS = 15_000;
const SCAN_BUDGET_MS = 25_000;
const MAX_PAGES = 30; // up to ~30k txs of dev-wallet history per refresh
const CACHE_MS = 5 * 60_000;
// A KAIRO-receiving tx counts as a buyback only if real SOL went out — this
// filters out fee-only txs (e.g. a claim mints KAIRO while ~5000 lamports of
// fee leaves the wallet, which is not a buyback).
const MIN_BUYBACK_SOL = 0.001;

export interface BuybackBurnStats {
  devWallet: string;
  solBoughtBack: number; // total SOL spent acquiring $KAIRO
  kairoBoughtBack: number; // total $KAIRO acquired via buybacks
  kairoBurned: number; // total $KAIRO destroyed via burn instructions
  currentSupply: number; // live $KAIRO mint supply (burns already removed)
  buybackTxs: number;
  burnTxs: number;
  lastBuybackTs: number | null;
  lastBurnTs: number | null;
  txScanned: number;
  capped: boolean; // hit the page/budget ceiling — totals may be partial
  updatedAt: number;
}

let cache: { ts: number; data: BuybackBurnStats } | null = null;

/** Live $KAIRO mint supply (whole tokens). Burns are already reflected here. */
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
    /* fall through */
  }
  return 0;
}

/** Sum $KAIRO destroyed by spl-token burn / burnChecked instructions in one tx. */
function burnedKairoRaw(tx: any): bigint {
  let total = 0n;
  const scan = (instrs: any[] | undefined) => {
    for (const ix of instrs ?? []) {
      const p = ix?.parsed;
      if (!p || (p.type !== "burn" && p.type !== "burnChecked")) continue;
      const info = p.info ?? {};
      if (info.mint !== KAIRO) continue;
      try {
        if (info.tokenAmount?.amount != null) total += BigInt(info.tokenAmount.amount);
        else if (info.amount != null) total += BigInt(info.amount);
      } catch {
        /* non-numeric amount — skip */
      }
    }
  };
  scan(tx?.transaction?.message?.instructions);
  for (const inner of tx?.meta?.innerInstructions ?? []) scan(inner.instructions);
  return total;
}

/**
 * Aggregate the dev wallet's $KAIRO buybacks and burns from on-chain history
 * (Helius getTransactionsForAddress). Buybacks = txs where the wallet received
 * $KAIRO and spent SOL; burns = spl-token burn instructions on the $KAIRO mint.
 * Cached ~5 min; a full rescan is bounded by a page/time budget.
 */
export async function getBuybackBurnStats(
  apiKey: string,
  devWallet: string,
  cluster: "mainnet" | "devnet" = "mainnet",
): Promise<BuybackBurnStats> {
  if (cache && Date.now() - cache.ts < CACHE_MS) return cache.data;

  const url = rpcUrl(cluster, apiKey);
  const deadline = Date.now() + SCAN_BUDGET_MS;

  let solBoughtBack = 0;
  let kairoBoughtBack = 0;
  let burnedRaw = 0n;
  let buybackTxs = 0;
  let burnTxs = 0;
  let lastBuybackTs: number | null = null;
  let lastBurnTs: number | null = null;
  let txScanned = 0;
  let capped = false;
  let token: string | null = null;

  try {
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
        filters: { status: "succeeded", tokenAccounts: "balanceChanged" },
      };
      if (token) opts.paginationToken = token;

      const r: any = await gtfa(url, devWallet, opts, PAGE_TIMEOUT_MS);
      const data: any[] = r?.data ?? [];

      for (const tx of data) {
        txScanned++;
        const ts = Number(tx.blockTime) || 0;

        // Burns — destroyed supply, unambiguous from parsed instructions.
        const b = burnedKairoRaw(tx);
        if (b > 0n) {
          burnedRaw += b;
          burnTxs++;
          if (ts && (lastBurnTs === null || ts > lastBurnTs)) lastBurnTs = ts;
        }

        // Buybacks — $KAIRO received while SOL was spent (a buy).
        const { solDelta, tokenDelta } = txDeltas(tx, devWallet);
        const kairoDelta = tokenDelta.get(KAIRO) ?? 0;
        if (kairoDelta > 1e-9) {
          const wsolDelta = tokenDelta.get(WSOL) ?? 0;
          const solSpent = Math.max(
            solDelta < 0 ? -solDelta / 1e9 : 0,
            wsolDelta < 0 ? -wsolDelta : 0,
          );
          if (solSpent >= MIN_BUYBACK_SOL) {
            solBoughtBack += solSpent;
            kairoBoughtBack += kairoDelta;
            buybackTxs++;
            if (ts && (lastBuybackTs === null || ts > lastBuybackTs)) lastBuybackTs = ts;
          }
        }
      }

      token = r?.paginationToken ?? null;
      if (!token || data.length < TX_LIMIT) break;
      if (page === MAX_PAGES - 1) capped = true;
    }
  } catch {
    // Network hiccup mid-scan: serve the last good snapshot if we have one.
    if (cache) return cache.data;
    capped = true;
  }

  const data: BuybackBurnStats = {
    devWallet,
    solBoughtBack,
    kairoBoughtBack,
    kairoBurned: Number(burnedRaw) / 10 ** DECIMALS,
    currentSupply: await getMintSupply(url),
    buybackTxs,
    burnTxs,
    lastBuybackTs,
    lastBurnTs,
    txScanned,
    capped,
    updatedAt: Date.now(),
  };
  cache = { ts: Date.now(), data };
  return data;
}
