import assert from "node:assert";
import { test } from "node:test";
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
import { computeScore } from "../src/score";

test("fresh wallet floors at MIN_SCORE", () => {
  const s = computeScore({ ageDays: 0, nTrades: 0, usdVolume: 0, medianHoldDays: 0 });
  assert.strictEqual(s.hashRate, 100);
});

test("maxed-out wallet approaches MAX_SCORE", () => {
  const s = computeScore({
    ageDays: 5000,
    nTrades: 5000,
    usdVolume: 50_000_000,
    medianHoldDays: 365,
  });
  assert.strictEqual(s.hashRate, 10_000);
});

test("scoring is deterministic and order-independent", () => {
  const input = { ageDays: 300.123456789, nTrades: 42, usdVolume: 12345.678, medianHoldDays: 17.5 };
  const a = computeScore(input);
  const b = computeScore({ ...input });
  assert.strictEqual(a.hashRate, b.hashRate);
  assert.deepStrictEqual(a, b);
});

test("hash rate is within [MIN_SCORE, MAX_SCORE]", () => {
  for (const t of [0, 1, 10, 100, 1000]) {
    const s = computeScore({ ageDays: t, nTrades: t, usdVolume: t * 100, medianHoldDays: t });
    assert.ok(s.hashRate >= 100 && s.hashRate <= 10_000, `out of range: ${s.hashRate}`);
  }
});

test("more activity never lowers the score", () => {
  const low = computeScore({ ageDays: 30, nTrades: 5, usdVolume: 500, medianHoldDays: 2 });
  const high = computeScore({ ageDays: 365, nTrades: 50, usdVolume: 50_000, medianHoldDays: 30 });
  assert.ok(high.hashRate > low.hashRate);
});

test("a known reference vector", () => {
  // age 365d, 50 trades, $50k volume, 15d median hold
  const s = computeScore({ ageDays: 365, nTrades: 50, usdVolume: 50_000, medianHoldDays: 15 });
  // recompute expected from the live SDK constants so this stays in sync
  const clamp = (x: number) => Math.min(1, Math.max(0, x));
  const age = clamp(Math.log1p(365) / Math.log1p(AGE_CAP_DAYS));
  const tr = clamp(Math.log1p(50) / Math.log1p(TRADE_CAP));
  const vol = clamp(Math.log1p(50_000) / Math.log1p(VOL_CAP));
  // hold curve: 0.9 by HOLD_90_DAYS, easing to 1.0 at HOLD_CAP_DAYS (15d here)
  const hold = 0.9 + 0.1 * ((15 - HOLD_90_DAYS) / (HOLD_CAP_DAYS - HOLD_90_DAYS));
  const raw = WEIGHTS.age * age + WEIGHTS.trade * tr + WEIGHTS.vol * vol + WEIGHTS.hold * hold;
  const expected = Math.round(MIN_SCORE + raw * (MAX_SCORE - MIN_SCORE));
  assert.strictEqual(s.hashRate, expected);
});
