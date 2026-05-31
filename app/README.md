# Kairo web app

The dapp where users preview their score, start mining, and claim $KAIRO.

- `/score` — connect a wallet, see a free, transparent breakdown of your hash rate.
- `/mine` — pay the 0.1 SOL initialization fee and join the pool (one signed transaction).
- `/dashboard` — live claimable balance, network stats, and the claim button.

Built on Next.js + Solana wallet adapter. Shared on-chain logic (PDA derivation, attestation encoding, accumulator preview) comes from [`packages/sdk`](../packages/sdk) so the app, scorer, and program agree exactly.

See [../docs/architecture.md](../docs/architecture.md) for how it all fits together.
