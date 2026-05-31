import {
  ASYMPTOTE_KAIRO,
  EMISSION_K_KAIRO,
  EMISSION_P,
  SECONDS_PER_DAY,
} from "./constants";

/**
 * Cumulative emission to the whole network, in whole KAIRO, `elapsed` seconds
 * after genesis. Power-law curve `E(t) = K·(t_days^(1−p) − 1)`, capped at the
 * mineable asymptote. Floating-point — for UI projections only; the on-chain
 * fixed-point math in `programs/kairo/src/math.rs` is authoritative.
 */
export function cumulativeEmissionKairo(elapsedSecs: number): number {
  if (elapsedSecs <= 0) return 0;
  const tDays = elapsedSecs / SECONDS_PER_DAY + 1;
  const e = EMISSION_K_KAIRO * (Math.pow(tDays, 1 - EMISSION_P) - 1);
  return Math.min(e, ASYMPTOTE_KAIRO);
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
