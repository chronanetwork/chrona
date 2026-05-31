# Scorer oracle

The open-source, deterministic service that turns a wallet's public Solana history into a Kairo hash rate, and signs the result as an ed25519 attestation the on-chain program can verify.

- **Scoring algorithm (normative):** [../docs/scoring-spec.md](../docs/scoring-spec.md)
- **Trust model — what this key can and cannot do:** [../docs/oracle-trust.md](../docs/oracle-trust.md)

```
src/
├── index.ts     HTTP server (GET /score preview, POST /score signed)
├── score.ts     deterministic scoring (the spec, in code)
├── helius.ts    Helius client: signatures, Enhanced Tx, DAS
├── pricing.ts   historical USD pricing (pinned source, fixed rounding)
├── attest.ts    ed25519 attestation signing
└── schema.ts    zod types + canonical attestation byte layout
```

Determinism is the whole point: the same on-chain data must always produce the same score, so anyone can independently verify any attestation.
