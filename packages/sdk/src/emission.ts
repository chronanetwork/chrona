import {
  ASYMPTOTE_KAIRO,
  EMISSION_BASE_H_SECONDS,
  EMISSION_BASE_KAIRO,
  EMISSION_SPIKE_H_SECONDS,
  EMISSION_SPIKE_KAIRO,
  HASHRATE_HALFLIFE_SECONDS,
} from "./constants";

/**
 * Effective hashrate after decay: full rate halved once per elapsed half-life
 * since the last top-off (`base >> floor(elapsed / halflife)`). Mirrors the
 * on-chain `math::decayed_hash_rate`.
 */
export function effectiveHashRate(
  base: number,
  lastTopupTs: number,
  nowSecs: number = Math.floor(Date.now() / 1000),
): number {
  const elapsed = nowSecs - lastTopupTs;
  if (elapsed <= 0) return base;
  const k = Math.min(63, Math.floor(elapsed / HASHRATE_HALFLIFE_SECONDS));
  return Math.floor(base / 2 ** k);
}

/**
 * Cumulative emission to the whole network, in whole KAIRO, `elapsed` seconds
 * after genesis. Sum of two halving curves (front-load spike + ~5k/day base),
 * capped at the mineable asymptote. Floating-point — for UI projections only;
 * the on-chain fixed-point math in `programs/kairo/src/math.rs` is authoritative.
 */
export function cumulativeEmissionKairo(elapsedSecs: number): number {
  if (elapsedSecs <= 0) return 0;
  const e =
    EMISSION_SPIKE_KAIRO * (1 - Math.pow(2, -elapsedSecs / EMISSION_SPIKE_H_SECONDS)) +
    EMISSION_BASE_KAIRO * (1 - Math.pow(2, -elapsedSecs / EMISSION_BASE_H_SECONDS));
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
