import assert from "node:assert";
import { test } from "node:test";
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
  // age 365d, 50 trades, $50k volume, 30d median hold
  const s = computeScore({ ageDays: 365, nTrades: 50, usdVolume: 50_000, medianHoldDays: 30 });
  // recompute expected by hand-rolled formula to lock the contract
  const clamp = (x: number) => Math.min(1, Math.max(0, x));
  const age = clamp(Math.log1p(365) / Math.log1p(730));
  const tr = clamp(Math.log1p(50) / Math.log1p(500));
  const vol = clamp(Math.log1p(50_000) / Math.log1p(1_000_000));
  const hold = clamp(30 / 90);
  const raw = 0.25 * age + 0.2 * tr + 0.3 * vol + 0.25 * hold;
  const expected = Math.round(100 + raw * 9900);
  assert.strictEqual(s.hashRate, expected);
});
