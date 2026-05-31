/**
 * CLI: score one or more wallets and print the breakdown.
 *
 *   HELIUS_API_KEY=... npm run score -- <wallet> [<wallet> ...]
 */
import { loadConfig } from "./config";
import { measureWallet } from "./helius";
import { computeScore } from "./score";

async function main() {
  const wallets = process.argv.slice(2);
  if (wallets.length === 0) {
    console.error("usage: npm run score -- <wallet> [<wallet> ...]");
    process.exit(1);
  }
  const config = loadConfig();
  for (const wallet of wallets) {
    const measurement = await measureWallet(wallet, {
      apiKey: config.heliusApiKey,
      cluster: config.cluster,
      maxSigPages: config.maxSigPages,
      maxTxPages: config.maxTxPages,
    });
    const breakdown = computeScore(measurement);
    console.log(`\n=== ${wallet} ===`);
    console.log(`hash rate: ${breakdown.hashRate}`);
    console.log("inputs:", breakdown.inputs);
    console.log("sub-scores:", {
      age: breakdown.ageScore,
      trade: breakdown.tradeScore,
      vol: breakdown.volScore,
      hold: breakdown.holdScore,
      raw: breakdown.raw,
    });
    console.log("meta:", {
      solPriceUsd: measurement.solPriceUsd,
      swapsScanned: measurement.swapsScanned,
      sigsScanned: measurement.totalSignaturesScanned,
      capped: measurement.capped,
    });
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
