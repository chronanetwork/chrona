# `@kairo/sdk`

Shared TypeScript used by both the scorer and the dapp so they agree with the on-chain program byte-for-byte:

- PDA derivation (`global`, `miner`, `mint_auth`, `treasury`)
- canonical attestation byte layout (`wallet ‖ score ‖ expiry ‖ nonce`)
- emission / accumulator preview helpers (mirror of `programs/kairo/src/math.rs`)
- generated program IDL types

See [../../docs/architecture.md](../../docs/architecture.md).
