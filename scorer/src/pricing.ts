/**
 * SOL/USD price used to value swap quote legs. For reproducibility a caller
 * should pin this (env `SOL_PRICE_USD` or the `solPriceUsd` option) and record
 * it alongside the score; the live fetch is a convenience fallback.
 */
import { getCachedSolUsd } from "./marketPrice";

const FALLBACK_SOL_USD = 150;

export async function getSolPriceUsd(): Promise<number> {
  const env = process.env.SOL_PRICE_USD;
  if (env && Number.isFinite(Number(env))) return Number(env);

  // Prefer the shared background price feed's cached SOL/USD, so scoring adds
  // no extra Jupiter load. Only falls through to a direct fetch if the feed
  // hasn't produced a value yet (e.g. before its first tick).
  const cached = getCachedSolUsd();
  if (cached != null && cached > 0) return cached;

  // Jupiter lite price API (no key). Falls back to a constant on failure.
  try {
    const res = await fetch("https://lite-api.jup.ag/price/v2?ids=So11111111111111111111111111111111111111112", {
      signal: AbortSignal.timeout(4000),
    });
    const json: any = await res.json();
    const price = Number(
      json?.data?.["So11111111111111111111111111111111111111112"]?.price,
    );
    if (Number.isFinite(price) && price > 0) return price;
  } catch {
    // ignore, use fallback
  }
  return FALLBACK_SOL_USD;
}
