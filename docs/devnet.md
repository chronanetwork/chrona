# Devnet deployment

Kairo is live on **Solana devnet** for testing and to follow along with the build.

## Addresses

| | |
|---|---|
| Program | `6MS8n87aRsXE5RjyVXuf9wcfARn5ut4m2YhBFE3kairo` |
| Mint ($KAIRO) | `HEZhbPyEoCNtEuiJh7hLuG8uuyiceUp2yduCVFKkairo` |
| Deployer / authority | `B1xtqSHWRaGMpPkfgkFYPsLkvQKzF7pLUckTF53kairo` |

State: mining **active**, 100,000 KAIRO premined to the deployer, 6 decimals.

Explore on [Solana Explorer (devnet)](https://explorer.solana.com/address/6MS8n87aRsXE5RjyVXuf9wcfARn5ut4m2YhBFE3kairo?cluster=devnet).

## Reproduce / operate

```bash
# 1. deploy the program (deployer keypair must hold devnet SOL)
anchor deploy --provider.cluster <devnet-rpc> --provider.wallet keys/deployer-keypair.json

# 2. create mint, premine 100k, initialize_global, hand over mint authority
npx tsx scripts/devnet-bootstrap.ts        # idempotent

# 3. dogfood: join as a miner (signed attestation) and claim
npx tsx scripts/devnet-mine.ts
```

`devnet-bootstrap.ts` prints the `ORACLE_SECRET_KEY` to run the scorer against
this deployment:

```bash
cd scorer
HELIUS_API_KEY=<key> SCORER_CLUSTER=mainnet ORACLE_SECRET_KEY=<printed> npm start
```

> Keypairs live in the gitignored `keys/` directory and are never committed.
> On mainnet the mint + premine come from a DBC launch (not these scripts); the
> DBC must leave mint authority with the deployer so `set_mint_authority` can
> hand it to the program. See [architecture.md](architecture.md).
