# Oracle & trust model

Kairo's goal is to be *verifiable*. This document is honest about what is trustless and what is trusted, and how the trusted part is constrained.

## The constraint

Scores depend on a wallet's full transaction history, which an on-chain program cannot read. Something off-chain has to compute the score. The question is how to make that something trustworthy.

## The v1 model: a single, open, deterministic oracle

- The scorer is **open-source** and **deterministic** — the algorithm is fully specified in [scoring-spec.md](scoring-spec.md), and the same public on-chain data always yields the same number. Anyone can re-run it and check that a given score is correct.
- The scorer signs each score as an **ed25519 attestation** over `{wallet, score, expiry, nonce}`.
- The on-chain program stores the oracle's public key and **refuses any score that isn't validly signed by it** (verified via the native ed25519 program + Instructions-sysvar introspection).
- Attestations **expire** (`attestation_validity_secs`), so a score reflects recent history and can't be hoarded.

## What the oracle key *can* do

- Decline to score a wallet (liveness, not safety).
- Sign a score within the algorithm's bounds.

## What the oracle key *cannot* do

- **It cannot mint, move, or steal KAIRO.** Minting is controlled solely by the program's mint-authority PDA, driven by the accumulator math.
- **It cannot exceed the rules unnoticed.** Because scoring is deterministic and public, any score that doesn't match the spec is provably wrong — the oracle is publicly accountable for every signature it issues.
- **It cannot inflate supply.** The 21M cap and the emission curve are enforced on-chain regardless of any score.

The worst a compromised oracle key can do is hand out **incorrect hash rates** (up to `MAX_HR`), unfairly skewing pool shares — bounded by the cap, and detectable by anyone recomputing scores. It can never break the supply or drain funds.

## Hardening roadmap

- **Key custody:** env var in dev → KMS / HSM in production.
- **Authority:** the program `authority` (which can rotate the oracle key, pause, and withdraw treasury) moves behind a multisig (e.g. Squads) for mainnet.
- **Decentralization (v2):** replace the single key with **M-of-N independent oracles** (threshold / multi-sig attestations), so no single party can issue a score. The deterministic spec makes independent oracles agree by construction.
- **Auditability:** publish issued attestations so third parties can continuously verify scores against the public algorithm.

## Summary

| Property | Status in v1 |
|---|---|
| Supply cap (21M) | Trustless (on-chain) |
| Emission schedule | Trustless (on-chain) |
| Reward distribution math | Trustless (on-chain) |
| Mint authority | Trustless (program PDA only) |
| Score *correctness* | Verifiable (open, deterministic — anyone can check) |
| Score *issuance* | Trusted (single oracle key in v1 → M-of-N in v2) |
