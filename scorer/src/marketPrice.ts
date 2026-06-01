import { MINT } from "@kairo/sdk";

const SOL = "So11111111111111111111111111111111111111112";
const KAIRO = MINT.toBase58();

export interface MarketPrices {
  kairoUsd: number | null;
  kairoChange24h: number | null;
  solUsd: number | null;
  blockId: number | null;
  at: number; // ms timestamp of the last successful upstream update
}

const EMPTY: MarketPrices = {
  kairoUsd: null,
  kairoChange24h: null,
  solUsd: null,
  blockId: null,
  at: 0,
};

let cache: MarketPrices = EMPTY;
let inflight: Promise<MarketPrices> | null = null;
let feedStarted = false;

async function fetchFromJupiter(apiKey: string): Promise<MarketPrices> {
  const res = await fetch(`https://api.jup.ag/price/v3?ids=${KAIRO},${SOL}`, {
    headers: apiKey ? { "x-api-key": apiKey } : {},
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) throw new Error(`jup price ${res.status}`);
  const j: any = await res.json();
  const k = j?.[KAIRO];
  const s = j?.[SOL];
  // Fall back to the last-good value for any field the response is missing.
  return {
    kairoUsd: typeof k?.usdPrice === "number" ? k.usdPrice : cache.kairoUsd,
    kairoChange24h: typeof k?.priceChange24h === "number" ? k.priceChange24h : cache.kairoChange24h,
    solUsd: typeof s?.usdPrice === "number" ? s.usdPrice : cache.solUsd,
    blockId: k?.blockId ?? s?.blockId ?? cache.blockId,
    at: Date.now(),
  };
}

/** Refresh the cached prices from Jupiter (single-flight). Keeps last-good on error. */
async function refreshPrices(apiKey: string): Promise<MarketPrices> {
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      cache = await fetchFromJupiter(apiKey);
    } catch {
      // transient upstream error — keep serving the last-good cache
    } finally {
      inflight = null;
    }
    return cache;
  })();
  return inflight;
}

/**
 * Background price feed: polls Jupiter every `intervalMs` and updates the cache,
 * so HTTP handlers never call Jupiter directly. Upstream load is exactly one
 * request per tick regardless of how many clients are polling /price or /stats.
 * Idempotent — safe to call once at startup.
 */
export function startPriceFeed(apiKey: string, intervalMs = 5000): void {
  if (feedStarted) return;
  feedStarted = true;
  void refreshPrices(apiKey);
  setInterval(() => void refreshPrices(apiKey), intervalMs);
  console.log(`[price] background feed enabled — refreshing every ${intervalMs / 1000}s`);
}

/**
 * Live $KAIRO + SOL prices, served from the background-refreshed cache. Never
 * triggers an upstream call except as a one-off if the cache is still empty
 * (e.g. the very first request before the feed's first tick lands).
 */
export async function getMarketPrices(apiKey: string): Promise<MarketPrices> {
  if (cache.at === 0) return refreshPrices(apiKey);
  return cache;
}
