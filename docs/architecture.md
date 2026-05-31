# Architecture

Kairo is three pieces that agree on one set of rules:

- **On-chain program** (`programs/kairo`, Anchor/Rust) — the source of truth: holds mint authority, tracks the mining pool, enforces the supply cap, mints rewards.
- **Scorer oracle** (`scorer`, TypeScript) — reads a wallet's public history, computes a deterministic score, and signs it.
- **DApp** (`app`, Next.js) — lets users preview their score, pay to start mining, and claim.
- **SDK** (`packages/sdk`) — shared TypeScript so all three derive PDAs and encode attestations identically.

## Why scoring is off-chain

A Solana program cannot read arbitrary historical transactions — it only sees the accounts passed into the current instruction. So a wallet's age / trades / volume / hold time *must* be computed off-chain. Kairo makes that trustworthy with an **attestation**: the open-source, deterministic scorer signs `{wallet, score, expiry, nonce}` with an oracle key, and the program verifies that signature before trusting the score. See [oracle-trust.md](oracle-trust.md).

## Flow

```
        ┌─────────────┐   GET /score (free preview)
        │   DApp /     │ ───────────────────────────►  Scorer oracle
        │   wallet     │   POST /score → signed attestation
        └─────┬───────┘ ◄───────────────────────────  (Helius: signatures,
              │                                          getTransactionsForAddress)
              │  tx = [ ed25519_verify_ix, initialize_miner_ix ]  (+ 0.1 SOL fee)
              ▼
        ┌──────────────────────────────────────────────┐
        │  Kairo program                                 │
        │  • verify oracle sig (Instructions sysvar)     │
        │  • update_pool()  ← O(1) accumulator           │
        │  • join: total_hash_rate += score              │
        │  • claim: MintTo CPI signed by mint_auth PDA   │
        └──────────────────────────────────────────────┘
```

## On-chain accounts

- **GlobalState** (PDA `["global"]`) — singleton config + pool state: `authority`, `oracle_pubkey`, `mint`, `treasury`, `genesis_ts`, `last_update_ts`, `acc_reward_per_hash` (u128, Q64.64 fixed point), `total_hash_rate`, `total_minted_base`, `premine_observed`, `init_fee_lamports`, `min_score`, `attestation_validity_secs`, `active`, `paused`, bumps.
- **Miner** (PDA `["miner", owner]`) — one per wallet: `owner`, `hash_rate`, `reward_debt` (u128), `accrued_base`, `joined_ts`, `attestation_expiry`, `score_nonce`, bump.
- **Mint authority PDA** (`["mint_auth"]`) — the SPL mint authority after handover.
- **Treasury PDA** (`["treasury"]`) — collects the 0.1 SOL fees; admin-withdrawable.

## The O(1) reward accumulator

Distributing a shared, continuously-decaying emission across an arbitrary number of miners — without iterating them — uses the MasterChef / Synthetix "reward per share" pattern.

`update_pool(now)` runs at the start of every state-changing instruction:

```
if !active || now <= last_update_ts: return
if total_hash_rate > 0:
    dE  = E(now) - E(last_update_ts)                  # closed-form emission, floored
    dE  = min(dE, ASYMPTOTE_BASE - total_minted_base) # cap enforcement
    acc_reward_per_hash += (dE << 64) / total_hash_rate
    total_minted_base   += dE
last_update_ts = now
```

A miner's settle step (run before any change to their hash rate, and on claim):

```
pending      = (acc_reward_per_hash - reward_debt) * hash_rate >> 64
accrued_base += pending
reward_debt  = acc_reward_per_hash
```

**Join ordering is critical:** on `initialize_miner` we (1) `update_pool`, (2) set the new miner's `reward_debt = acc_reward_per_hash`, then (3) add to `total_hash_rate`. Settling the pool *before* increasing total hash rate ensures a new miner can never claim emission from before they joined.

The emission integral `E(t)` and the fixed-point `2^(−x)` it needs live in `programs/kairo/src/math.rs`, tested against a reference table to <1e-9.

## Instruction set

| Instruction | Who | What |
|---|---|---|
| `initialize_global` | authority | One-time: record mint + config, `active = false`. |
| `set_mint_authority` | deployer | CPI `SetAuthority` → mint authority becomes the program PDA; record `premine_observed`, set `active = true`, start genesis clock. |
| `initialize_miner` | user | Verify oracle attestation, charge 0.1 SOL → treasury, join the pool. |
| `re_attest` | miner | Settle, then swap to a fresh (higher/lower) score. |
| `claim` | miner | Settle, mint accrued KAIRO to the miner via PDA. |
| `admin` | authority | `set_oracle_pubkey`, `set_params`, `pause`/`unpause`, `withdraw_treasury`. |

## Ed25519 verification

Solana verifies ed25519 signatures via the native `Ed25519SigVerify111…` program, not inside our instruction. The client therefore submits a transaction with two instructions: the native verify instruction first, then `initialize_miner`. Inside `initialize_miner` we read the **Instructions sysvar**, confirm instruction 0 is the ed25519 program, and assert that the signed **public key equals our `oracle_pubkey`** and the signed **message equals our in-program reconstruction** of `{wallet ‖ score ‖ expiry ‖ nonce}`. This is the most security-sensitive parsing in the program and is covered by adversarial tests.

## Deployment path

Localnet (`anchor test`) → devnet (real Helius devnet, 100k minted to deployer, test oracle key) → mainnet (DBC launch, oracle key in KMS, authority behind a multisig).
