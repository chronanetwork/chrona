import { ASYMPTOTE_KAIRO, H_SECONDS } from "./constants";

/**
 * Cumulative emission to the whole network, in whole KAIRO, `elapsed` seconds
 * after genesis. Floating-point — for UI projections only; the on-chain
 * fixed-point math in `programs/kairo/src/math.rs` is authoritative.
 */
export function cumulativeEmissionKairo(elapsedSecs: number): number {
  return ASYMPTOTE_KAIRO * (1 - Math.pow(2, -elapsedSecs / H_SECONDS));
}

/** KAIRO emitted to the whole network over the 24h starting at `elapsedSecs`. */
export function dailyEmissionKairo(elapsedSecs: number): number {
  return (
    cumulativeEmissionKairo(elapsedSecs + 86_400) -
    cumulativeEmissionKairo(elapsedSecs)
  );
}

/**
 * Projected KAIRO a miner earns per day, given the network's current daily
 * emission and the miner's share of total hash rate.
 */
export function projectedDailyKairo(
  hashRate: number,
  totalHashRate: number,
  elapsedSecs: number,
): number {
  if (totalHashRate <= 0) return 0;
  return (dailyEmissionKairo(elapsedSecs) * hashRate) / totalHashRate;
}
