# DefiLlama adapter

Kairo is listed on DefiLlama under **Fees & Revenue** — not TVL. There's no TVL
to report (Kairo is a mined token; no capital is locked in the protocol). What's
real and on-chain is the fee flow that powers the buyback-and-burn flywheel.

## What it reports

- **Fees** — all SOL miners pay the program (0.1 SOL to start a miner + 0.02 SOL
  per hashrate top-off).
- **Revenue / Protocol revenue** — the operations half of fees.
- **Holders revenue** — the buyback-and-burn half (value returned to holders by
  permanently shrinking supply).

## How it works

`kairo.js` is a standard DefiLlama Solana fees adapter. For each day it asks the
Kairo scorer for that day's fees:

```
GET https://score.kairo.win/defillama/fees?day=YYYY-MM-DD
-> { day, feesSol, revenueSol }
```

The scorer derives these numbers directly from the treasury's on-chain
transaction history (no off-chain bookkeeping), so they're independently
verifiable. The adapter adds the amounts as native SOL via `createBalances()`,
and DefiLlama prices SOL at the correct historical timestamp.

## Submitting

1. Fork `https://github.com/DefiLlama/DefiLlama-Adapters`.
2. Copy `kairo.js` to `fees/kairo.js`.
3. Sanity-check it against current adapter conventions and test:
   `npm test -- fees/kairo.js` (their helper imports / `options` shape change
   occasionally — adjust the `fetchURL` import or `addCGToken` call if their CI
   flags it).
4. Open the PR.

Project metadata to fill in on the PR / protocols.json: name "Kairo", chain
"Solana", category "Fees", token `HEZhbPyEoCNtEuiJh7hLuG8uuyiceUp2yduCVFKkairo`,
url `https://kairo.win`, github `KairoMine/kairo`.
