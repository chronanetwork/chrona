# `kairo` program

The on-chain heart of Kairo — an Anchor program that holds the $KAIRO mint authority, runs the proof-of-activity mining pool, and enforces the supply cap.

- **Accounts, instructions, and the O(1) reward accumulator:** [../../docs/architecture.md](../../docs/architecture.md)
- **Emission math (`src/math.rs`):** [../../docs/tokenomics.md](../../docs/tokenomics.md)
- **Attestation verification (`src/ed25519.rs`):** [../../docs/oracle-trust.md](../../docs/oracle-trust.md)

```
src/
├── lib.rs            program entry + instruction dispatch
├── state.rs          GlobalState, Miner accounts
├── constants.rs      emission constants + PDA seeds
├── errors.rs         KairoError
├── math.rs           fixed-point exp2_neg, E(t), accumulator
├── ed25519.rs        Instructions-sysvar attestation verification
└── instructions/     initialize_global, set_mint_authority,
                      initialize_miner, re_attest, claim, admin
```

Program ID: `6MS8n87aRsXE5RjyVXuf9wcfARn5ut4m2YhBFE3kairo`
