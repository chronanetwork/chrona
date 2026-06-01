import {
  AGE_CAP_DAYS,
  HOLD_90_DAYS,
  HOLD_CAP_DAYS,
  MAX_SCORE,
  MIN_SCORE,
  TRADE_CAP,
  VOL_CAP,
  WEIGHTS,
} from "@kairo/sdk";

/** Raw measured inputs for a wallet (see docs/scoring-spec.md). */
export interface WalletActivity {
  /** Days since the wallet's earliest observed transaction. */
  ageDays: number;
  /** Count of qualifying swaps (notional ≥ MIN_TRADE_USD). */
  nTrades: number;
  /** Sum of qualifying-swap notionals, USD. */
  usdVolume: number;
  /** Median holding period (days) of tokens the wallet bought. */
  medianHoldDays: number;
}

export interface ScoreBreakdown {
  ageScore: number;
  tradeScore: number;
  volScore: number;
  holdScore: number;
  raw: number;
  hashRate: number;
  inputs: WalletActivity;
}

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

/** Round to `d` decimal places (deterministic, ties away from zero via Math.round). */
function round(x: number, d: number): number {
  const f = 10 ** d;
  return Math.round(x * f) / f;
}

/**
 * Hold-time curve: ramps to 0.9 by `HOLD_90_DAYS` (3 days), then eases to 1.0
 * at `HOLD_CAP_DAYS` (30 days) and stays capped beyond.
 */
function holdCurve(days: number): number {
  if (days <= 0) return 0;
  if (days >= HOLD_CAP_DAYS) return 1;
  if (days <= HOLD_90_DAYS) return 0.9 * (days / HOLD_90_DAYS);
  return 0.9 + 0.1 * ((days - HOLD_90_DAYS) / (HOLD_CAP_DAYS - HOLD_90_DAYS));
}

/**
 * Deterministic score = hash rate. Identical inputs always yield an identical
 * integer. This is the normative implementation of docs/scoring-spec.md.
 */
export function computeScore(raw: WalletActivity): ScoreBreakdown {
  // Round inputs to fixed precision so the result is reproducible.
  // Hold time counts in 0.1-day increments.
  const inputs: WalletActivity = {
    ageDays: round(Math.max(0, raw.ageDays), 6),
    nTrades: Math.max(0, Math.floor(raw.nTrades)),
    usdVolume: round(Math.max(0, raw.usdVolume), 2),
    medianHoldDays: round(Math.max(0, raw.medianHoldDays), 1),
  };

  const ageScore = clamp01(Math.log1p(inputs.ageDays) / Math.log1p(AGE_CAP_DAYS));
  const tradeScore = clamp01(Math.log1p(inputs.nTrades) / Math.log1p(TRADE_CAP));
  const volScore = clamp01(Math.log1p(inputs.usdVolume) / Math.log1p(VOL_CAP));
  const holdScore = holdCurve(inputs.medianHoldDays);

  const rawScore =
    WEIGHTS.age * ageScore +
    WEIGHTS.trade * tradeScore +
    WEIGHTS.vol * volScore +
    WEIGHTS.hold * holdScore;

  const hashRate = Math.round(MIN_SCORE + rawScore * (MAX_SCORE - MIN_SCORE));

  return {
    ageScore: round(ageScore, 6),
    tradeScore: round(tradeScore, 6),
    volScore: round(volScore, 6),
    holdScore: round(holdScore, 6),
    raw: round(rawScore, 6),
    hashRate,
    inputs,
  };
}
