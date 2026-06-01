import { MINT } from "@kairo/sdk";

const SOL = "So11111111111111111111111111111111111111112";
const KAIRO = MINT.toBase58();

let cache: { ts: number; data: MarketPrices } | null = null;

export interface MarketPrices {
  kairoUsd: number | null;
  kairoChange24h: number | null;
  solUsd: number | null;
  blockId: number | null;
  at: number;
}

/** Live $KAIRO + SOL prices from Jupiter Price API v3 (cached ~30s). */
export async function getMarketPrices(apiKey: string): Promise<MarketPrices> {
  if (cache && Date.now() - cache.ts < 30_000) return cache.data;
  try {
    const res = await fetch(`https://api.jup.ag/price/v3?ids=${KAIRO},${SOL}`, {
      headers: apiKey ? { "x-api-key": apiKey } : {},
      signal: AbortSignal.timeout(5000),
    });
    const j: any = await res.json();
    const k = j?.[KAIRO];
    const s = j?.[SOL];
    const data: MarketPrices = {
      kairoUsd: typeof k?.usdPrice === "number" ? k.usdPrice : null,
      kairoChange24h: typeof k?.priceChange24h === "number" ? k.priceChange24h : null,
      solUsd: typeof s?.usdPrice === "number" ? s.usdPrice : null,
      blockId: k?.blockId ?? s?.blockId ?? null,
      at: Date.now(),
    };
    cache = { ts: Date.now(), data };
    return data;
  } catch {
    return cache?.data ?? { kairoUsd: null, kairoChange24h: null, solUsd: null, blockId: null, at: Date.now() };
  }
}
