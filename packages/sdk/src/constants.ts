import { PublicKey } from "@solana/web3.js";

/** Deployed program id (vanity, ends in `kairo`). */
export const PROGRAM_ID = new PublicKey(
  "6MS8n87aRsXE5RjyVXuf9wcfARn5ut4m2YhBFE3kairo",
);

/** $KAIRO mint (vanity, ends in `kairo`). */
export const MINT = new PublicKey(
  "HEZhbPyEoCNtEuiJh7hLuG8uuyiceUp2yduCVFKkairo",
);

// ---- token / emission ----
export const DECIMALS = 6;
export const ONE_KAIRO = 1_000_000n;
/** Mineable cap, whole KAIRO (asymptote). */
export const ASYMPTOTE_KAIRO = 20_900_000;
/** Hard cap incl. premine, whole KAIRO. */
export const MAX_SUPPLY_KAIRO = 21_000_000;
/** Launch supply, whole KAIRO. */
export const PREMINE_KAIRO = 100_000;
// Emission = sum of two halving curves (front-load spike + ~5k/day base plateau).
// E(t) = SPIKE·(1−2^(−t/H_spike)) + BASE·(1−2^(−t/H_base)), whole KAIRO.
export const EMISSION_SPIKE_KAIRO = 47_051.945457;
export const EMISSION_SPIKE_H_SECONDS = 78_946;
export const EMISSION_BASE_KAIRO = 20_852_948.054543;
export const EMISSION_BASE_H_SECONDS = 250_560_000;
/** Initialization fee, lamports (0.1 SOL). */
export const INIT_FEE_LAMPORTS = 100_000_000n;

// ---- scoring (see docs/scoring-spec.md) ----
export const MIN_SCORE = 100;
export const MAX_SCORE = 10_000;
export const MIN_TRADE_USD = 10;
export const AGE_CAP_DAYS = 730;
export const TRADE_CAP = 500;
export const VOL_CAP = 1_000_000;
export const HOLD_CAP_DAYS = 30; // hold time saturates at 100% here
export const HOLD_90_DAYS = 3; // ...and reaches 90% by 3 days
export const HOLD_STEP_DAYS = 0.1; // hold time counts in 0.1-day increments
export const WEIGHTS = { age: 0.25, trade: 0.2, vol: 0.3, hold: 0.25 } as const;

// ---- PDA seeds ----
export const GLOBAL_SEED = Buffer.from("global");
export const MINER_SEED = Buffer.from("miner");
export const MINT_AUTH_SEED = Buffer.from("mint_auth");
