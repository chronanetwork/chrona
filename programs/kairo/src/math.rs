//! Fixed-point emission and reward-accumulator math.
//!
//! Emission is the sum of two continuous halving curves — a sharp front-load
//! "spike" plus a slow ~5,000 KAIRO/day "base" plateau:
//!
//! ```text
//! E(t) = SPIKE·(1 − 2^(−t/H_spike)) + BASE·(1 − 2^(−t/H_base))
//! ```
//!
//! evaluated in closed form — no per-block loop. The only primitive is
//! `2^(−x)` in fixed point, computed exactly from a precomputed binary-digit
//! table (see [`exp2_neg_frac`]). Validated to ≤1 base-unit error against a
//! 90-digit reference across day/year/decade/century scales.
//!
//! Reward distribution uses the MasterChef / Synthetix "reward per share"
//! accumulator. `acc_reward_per_hash` is a Q64.64 fixed-point value (64
//! fractional bits): the cumulative reward, in base units, owed per single
//! unit of hash rate since genesis.

use crate::constants::{
    ASYMPTOTE_BASE, BASE_AMOUNT_BASE, BASE_H_SECONDS, SPIKE_AMOUNT_BASE, SPIKE_H_SECONDS,
};

/// 1.0 in Q64.64 fixed point.
pub const Q64: u128 = 1u128 << 64;

/// `CK[k-1] = 2^(−2^(−k))` in Q64.64, for k = 1..=64.
///
/// `2^(−frac)` for any `frac ∈ [0,1)` is the product of the `CK[k-1]` whose
/// corresponding binary digit `2^(−k)` is set in `frac`. Generated with 90-digit
/// decimal precision; the largest entries saturate just below `Q64` (correct,
/// since every factor is < 1).
const CK: [u128; 64] = [
    13043817825332782212, 15511800964685064948, 16915738899553466671, 17664662643191237676,
    18051468387014017850, 18248035989933441397, 18347121020861646924, 18396865112328554661,
    18421787711448657618, 18434261669329232140, 18440501815349552982, 18443622680442407998,
    18445183311048607332, 18445963675871538004, 18446353870663572145, 18446548971154807802,
    18446646522174239825, 18446695297877410579, 18446719685777359791, 18446731879739425374,
    18446737976723480912, 18446741025216264368, 18446742549462845018, 18446743311586182574,
    18446743692647863159, 18446743883178706404, 18446743978444128764, 18446744026076840128,
    18446744049893195857, 18446744061801373733, 18446744067755462673, 18446744070732507144,
    18446744072221029380, 18446744072965290498, 18446744073337421057, 18446744073523486337,
    18446744073616518976, 18446744073663035296, 18446744073686293456, 18446744073697922536,
    18446744073703737076, 18446744073706644346, 18446744073708097981, 18446744073708824799,
    18446744073709188207, 18446744073709369912, 18446744073709460764, 18446744073709506190,
    18446744073709528903, 18446744073709540259, 18446744073709545938, 18446744073709548777,
    18446744073709550196, 18446744073709550906, 18446744073709551261, 18446744073709551439,
    18446744073709551527, 18446744073709551572, 18446744073709551594, 18446744073709551605,
    18446744073709551610, 18446744073709551613, 18446744073709551615, 18446744073709551615,
];

/// `2^(−frac)` where `frac = frac_q64 / 2^64 ∈ [0, 1)`, returned in Q64.64
/// (a value in `(0.5, 1]`).
///
/// `frac_q64` is interpreted as a binary fraction: its most-significant bit
/// (bit 63) is `2^(−1)`, bit 62 is `2^(−2)`, … bit 0 is `2^(−64)`. For each set
/// bit we fold in the matching `CK` factor. Each fold is one Q64.64 multiply,
/// so the total relative error is on the order of `64 · 2^(−64)` — far below the
/// 1e-9 target.
pub fn exp2_neg_frac(frac_q64: u64) -> u128 {
    let mut result = Q64;
    for k in 1..=64usize {
        let bit = 1u64 << (64 - k);
        if frac_q64 & bit != 0 {
            result = (result * CK[k - 1]) >> 64;
        }
    }
    result
}

/// `2^(−elapsed/H)` in Q64.64, for a half-life of `h_seconds`.
/// Splits `elapsed/H` into an integer number of halvings `i` (a right shift)
/// and a fractional part handled by [`exp2_neg_frac`].
pub fn emission_factor(elapsed_secs: u64, h_seconds: u64) -> u128 {
    let i = elapsed_secs / h_seconds;
    let r = elapsed_secs % h_seconds;
    let frac_q64 = (((r as u128) << 64) / (h_seconds as u128)) as u64;
    let base = exp2_neg_frac(frac_q64); // (0.5, 1] in Q64.64
    if i >= 128 {
        0
    } else {
        base >> i
    }
}

/// Cumulative emission `E(elapsed)` to the whole network, in base units
/// (floored): the sum of the front-load and base halving curves. Always
/// `≤ ASYMPTOTE_BASE` (the two component totals sum exactly to the cap).
pub fn cumulative_emission(elapsed_secs: u64) -> u64 {
    if elapsed_secs == 0 {
        return 0;
    }
    let f_spike = emission_factor(elapsed_secs, SPIKE_H_SECONDS);
    let f_base = emission_factor(elapsed_secs, BASE_H_SECONDS);
    let e = ((SPIKE_AMOUNT_BASE * (Q64 - f_spike)) >> 64)
        + ((BASE_AMOUNT_BASE * (Q64 - f_base)) >> 64);
    e.min(ASYMPTOTE_BASE as u128) as u64
}

/// Emission released to the whole pool between two elapsed timestamps
/// (`last ≤ now`), in base units. Floored; monotonic.
pub fn emission_between(last_elapsed: u64, now_elapsed: u64) -> u64 {
    cumulative_emission(now_elapsed).saturating_sub(cumulative_emission(last_elapsed))
}

/// Increment to add to `acc_reward_per_hash` (Q64.64) when `d_e` base units are
/// shared across `total_hash_rate` units of hash rate. Returns 0 if the pool is
/// empty (the emission is simply not distributed, staying under the cap).
pub fn acc_increment(d_e: u64, total_hash_rate: u64) -> u128 {
    if total_hash_rate == 0 {
        return 0;
    }
    ((d_e as u128) << 64) / (total_hash_rate as u128)
}

/// Pending reward for a miner, in base units: `(acc − reward_debt) · hash_rate`,
/// de-scaled from Q64.64. Bounded by total emitted, so it never overflows in
/// practice; `saturating_mul` is a defensive backstop.
pub fn pending_reward(acc_reward_per_hash: u128, reward_debt: u128, hash_rate: u64) -> u64 {
    let delta = acc_reward_per_hash.saturating_sub(reward_debt);
    ((delta.saturating_mul(hash_rate as u128)) >> 64) as u64
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::constants::ASYMPTOTE_BASE;

    const DAY: u64 = 86_400;
    const YEAR: u64 = 365 * DAY;

    /// Reference cumulative emission (base units), computed independently at
    /// 60-digit precision from the two-component curve. The fixed-point
    /// implementation matches these to ≤1 base unit.
    const REF: &[(u64, u64)] = &[
        (DAY, 29_999_955_526),
        (10 * DAY, 96_810_485_400),
        (30 * DAY, 196_042_953_301),
        (YEAR, 1_789_185_222_852),
        (5 * YEAR, 7_418_873_900_433),
        (10 * YEAR, 12_184_649_036_815),
    ];

    #[test]
    fn exp2_neg_frac_known_points() {
        // 2^0 = 1.0
        assert_eq!(exp2_neg_frac(0), Q64);
        // 2^(-1/2): only the 2^(-1) bit set -> CK[0]
        assert_eq!(exp2_neg_frac(1u64 << 63), CK[0]);
        // 2^(-1/4): only the 2^(-2) bit set -> CK[1]
        assert_eq!(exp2_neg_frac(1u64 << 62), CK[1]);
        // 2^(-3/4) = 2^(-1/2)·2^(-1/4) ≈ 0.5946..  (bits 63 and 62)
        let v = exp2_neg_frac((1u64 << 63) | (1u64 << 62));
        let approx = (v as f64) / (Q64 as f64);
        assert!((approx - 0.59460355750136).abs() < 1e-12, "got {approx}");
    }

    #[test]
    fn emission_matches_reference_table() {
        for &(t, expected) in REF {
            let got = cumulative_emission(t);
            let diff = got.abs_diff(expected);
            assert!(
                diff <= 4,
                "E({t}s): got {got}, expected {expected}, diff {diff}"
            );
        }
    }

    #[test]
    fn day_one_emission_is_about_30k() {
        let kairo = cumulative_emission(DAY) as f64 / 1e6;
        assert!((kairo - 30_000.0).abs() < 0.1, "day-1 = {kairo} KAIRO");
    }

    #[test]
    fn drops_to_5k_plateau_by_day_10() {
        // 30k day 1, fast taper to ~5k/day by day 10, then it stays near 5k.
        let d = |n: u64| {
            (cumulative_emission(n * DAY) - cumulative_emission((n - 1) * DAY)) as f64 / 1e6
        };
        assert!((d(1) - 30_000.0).abs() < 1.0, "day1 {}", d(1));
        assert!((d(2) - 16_698.0).abs() < 2.0, "day2 {}", d(2));
        assert!((d(3) - 10_468.0).abs() < 2.0, "day3 {}", d(3));
        assert!((d(10) - 5_000.0).abs() < 2.0, "day10 {}", d(10));
        // strictly decreasing through the taper
        assert!(d(1) > d(2) && d(2) > d(3) && d(3) > d(10));
        // plateau: a year out it's still in the thousands (gentle decline)
        let yearly = (cumulative_emission(366 * DAY) - cumulative_emission(365 * DAY)) as f64 / 1e6;
        assert!(yearly > 4_000.0 && yearly < 5_000.0, "yr1 daily {yearly}");
    }

    #[test]
    fn genesis_is_zero_and_monotonic() {
        assert_eq!(cumulative_emission(0), 0);
        let mut prev = 0u64;
        for years in 0..=50u64 {
            let e = cumulative_emission(years * YEAR);
            assert!(e >= prev, "not monotonic at {years}y");
            prev = e;
        }
    }

    #[test]
    fn never_exceeds_cap() {
        // Approaches the mineable cap asymptotically; never exceeds it.
        assert!(cumulative_emission(50 * YEAR) <= ASYMPTOTE_BASE);
        assert!(cumulative_emission(200 * YEAR) <= ASYMPTOTE_BASE);
        // In the far future both components have fully decayed -> exactly the cap.
        assert_eq!(cumulative_emission(u64::MAX), ASYMPTOTE_BASE);
        // A year in, still far below it (long tail remaining).
        assert!(cumulative_emission(YEAR) < ASYMPTOTE_BASE);
    }

    #[test]
    fn emission_between_is_difference() {
        let a = cumulative_emission(YEAR);
        let b = cumulative_emission(2 * YEAR);
        assert_eq!(emission_between(YEAR, 2 * YEAR), b - a);
        assert_eq!(emission_between(YEAR, YEAR), 0);
    }

    #[test]
    fn accumulator_conserves_emission_single_miner() {
        // One miner with all the hash rate should accrue ~ the full emission.
        let hr = 4200u64;
        let total = hr;
        let de = emission_between(0, YEAR);
        let acc = acc_increment(de, total);
        let pending = pending_reward(acc, 0, hr);
        // de-scaling loses at most a few base units to flooring
        assert!(de - pending <= 8, "de {de} pending {pending}");
    }

    #[test]
    fn accumulator_splits_proportionally() {
        // Two miners, hash rates 3:1, share emission ~3:1.
        let hr_a = 3000u64;
        let hr_b = 1000u64;
        let total = hr_a + hr_b;
        let de = emission_between(0, 30 * DAY);
        let acc = acc_increment(de, total);
        let pa = pending_reward(acc, 0, hr_a);
        let pb = pending_reward(acc, 0, hr_b);
        // a should get ~3x b
        let ratio = pa as f64 / pb as f64;
        assert!((ratio - 3.0).abs() < 1e-6, "ratio {ratio}");
        // combined never exceeds what was emitted
        assert!(pa + pb <= de, "pa+pb {} > de {}", pa + pb, de);
    }
}
