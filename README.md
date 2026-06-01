<div align="center">

<img src="assets/logo.png" alt="Chrona" width="108" height="108" />

# Chrona

### Rewarding real activity on-chain.

**Proof of Activity — mined by the wallets that actually use Solana.**

`$CHRONA` is an ERC20 token you don't buy your way into. You earn it by having been *active* on Ethereum: your wallet's real history — age, trades, volume, conviction — is its mining rig.

[Website](https://chrona.network) · [X / Twitter](https://x.com/MineChrona) · [Docs](docs/)

</div>

---

## The idea

Every other token rewards capital. Chrona rewards *activity*.

When you join, Chrona reads your wallet's on-chain life — how long you've been here, how much you've actually traded, the size of your flow, how long you hold what you buy — and distills it into a single number: your **score**. That score is your **hash rate**.

There's no GPU, no winner-take-all lottery. Every active wallet mines *simultaneously*, sharing each instant of emission in proportion to its share of the total network hash rate. A long-lived, high-conviction trader mines faster than a fresh wallet — but the fresh wallet still mines. Everyone who shows up gets a seat at the table; the table just isn't flat.

```
your share of this moment's emission  =  your hash rate / total network hash rate
```

## How it works

1. **Get scored.** Connect a wallet and Chrona previews your score for free — a transparent breakdown of age, trades, volume, and hold time. The scoring is open-source and deterministic: anyone can recompute your number from public data.
2. **Start mining.** Pay a one-time **0.1 SOL** initialization fee and register on-chain. From that moment your wallet is mining $CHRONA, 24/7, no hardware required.
3. **Claim.** Rewards accrue continuously. Claim whenever you like — the program mints fresh $CHRONA straight to your wallet.

## The emission curve

A sharp early burst that settles onto a long, steady plateau.

- **1,000,000** $CHRONA at genesis (the launch supply).
- **300,000** $CHRONA on day one, dropping fast — ~227k day two, ~174k day three — down to a **steady ~50,000 $CHRONA/day by day 10**, so the **earliest miners earn the most**.
- From there it rides down from ~50k/day (base half-life 1 year), approaching a hard ceiling of **21,000,000** $CHRONA it never quite reaches — ~97% mined by year 5.

Mathematically it's the sum of two curves: a fast front-load spike plus a 1-year ~50k/day base. → [docs/tokenomics.md](docs/tokenomics.md)

## Built to be verified

Chrona is open-source end to end. The scoring algorithm is public and reproducible, every score is a signed, auditable attestation, and the on-chain program enforces the supply cap and reward math with no privileged minting. → [docs/oracle-trust.md](docs/oracle-trust.md)

The program is **deployed and formally verified on mainnet** — the on-chain bytecode provably matches this repo:

- Mining Contract: `TBA`

Mining opens once the $CHRONA mint authority is handed to the program at token launch.

## On-chain addresses

| | Address |
|---|---|
| Mining Contract | `TBA` |
| $CHRONA token (mint) | `TBA` |
| Treasury | `TBA` |

*The treasury is currently the deploy/upgrade authority; it receives the 0.1 SOL init and 0.02 SOL top-off fees.*

## Dig deeper

| | |
|---|---|
| **Architecture** — how the program, the scorer, and the dapp fit together | [docs/architecture.md](docs/architecture.md) |
| **Tokenomics** — the emission math, derived and validated | [docs/tokenomics.md](docs/tokenomics.md) |
| **Scoring spec** — exactly how a wallet becomes a hash rate | [docs/scoring-spec.md](docs/scoring-spec.md) |
| **Oracle & trust model** — what's trustless, what's trusted, and why | [docs/oracle-trust.md](docs/oracle-trust.md) |
| **On-chain program** | [programs/kairo](programs/kairo) |
| **Scorer oracle** | [scorer](scorer) |
| **Web app** | [app](app) |

---

<div align="center">
<sub>Chrona — the opportune moment. Mine it.</sub>
</div>
