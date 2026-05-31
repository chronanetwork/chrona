//! Fixed-point emission and reward-accumulator math.
//!
//! Emission follows a continuous halving curve `r(t) = r0 · 2^(−t/H)`, whose
//! cumulative form
//!
//! ```text
//! E(t) = ASYMPTOTE · (1 − 2^(−t/H))
//! ```
//!
//! is evaluated in closed form — there is no per-block loop, and the result is
//! exact across any number of halving boundaries. The only nontrivial
//! primitive is `2^(−x)` in fixed point, which we compute exactly from a
//! precomputed binary-digit table (see [`exp2_neg_frac`]).
//!
//! Reward distribution uses the MasterChef / Synthetix "reward per share"
//! accumulator. `acc_reward_per_hash` is a Q64.64 fixed-point value (64
//! fractional bits): the cumulative reward, in base units, owed per single
//! unit of hash rate since genesis.

use crate::constants::{ASYMPTOTE_BASE, H_SECONDS};

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

/// `2^(−elapsed/H)` in Q64.64, where `elapsed` is seconds since genesis.
///
/// Splits `elapsed/H` into an integer number of halvings `i` (a right shift)
/// and a fractional part handled by [`exp2_neg_frac`].
pub fn emission_factor(elapsed_secs: u64) -> u128 {
    let i = elapsed_secs / H_SECONDS;
    let r = elapsed_secs % H_SECONDS;
    let frac_q64 = (((r as u128) << 64) / (H_SECONDS as u128)) as u64;
    let base = exp2_neg_frac(frac_q64); // (0.5, 1] in Q64.64
    if i >= 128 {
        0
    } else {
        base >> i
    }
}

/// Cumulative emission `E(elapsed)` to the whole network, in base units
/// (floored). Always `≤ ASYMPTOTE_BASE`.
pub fn cumulative_emission(elapsed_secs: u64) -> u64 {
    let f = emission_factor(elapsed_secs); // ≤ Q64
    let one_minus = Q64 - f; // ∈ [0, Q64]
    ((ASYMPTOTE_BASE as u128 * one_minus) >> 64) as u64
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

    /// Reference cumulative emission (base units, floored), computed
    /// independently at 90-digit precision from `E(t) = ASYMPTOTE·(1−2^(−t/H))`.
    const REF: &[(u64, u64)] = &[
        (DAY, 29_978_481_418),
        (YEAR, 8_523_176_202_598),
        (2 * YEAR, 13_570_537_449_190),
        (5 * YEAR, 19_377_837_928_057),
        (10 * YEAR, 20_789_139_838_600),
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
        assert!((kairo - 29_978.48).abs() < 0.1, "day-1 = {kairo} KAIRO");
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
        // far future: ~200 years and an absurd timestamp
        assert!(cumulative_emission(200 * YEAR) <= ASYMPTOTE_BASE);
        assert!(cumulative_emission(u64::MAX) <= ASYMPTOTE_BASE);
        // and it should be essentially at the cap by then
        assert!(cumulative_emission(200 * YEAR) > ASYMPTOTE_BASE - ONE_KAIRO_TEST);
    }
    const ONE_KAIRO_TEST: u64 = 1_000_000;

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
