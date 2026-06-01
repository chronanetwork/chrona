export interface ScorerConfig {
  heliusApiKey: string;
  cluster: "mainnet" | "devnet";
  attestationValiditySecs: number;
  port: number;
  maxTxPages: number;
  budgetMs: number;
  // poke keeper
  keeperEnabled: boolean;
  keeperRpcUrl: string;
  keeperSecretKey: string;
  keeperIntervalMs: number;
  keeperMaxPerCycle: number;
  jupApiKey: string;
}

export function loadConfig(): ScorerConfig {
  const heliusApiKey = process.env.HELIUS_API_KEY ?? "";
  if (!heliusApiKey) {
    console.warn("[scorer] WARNING: HELIUS_API_KEY unset; measurement calls will fail.");
  }
  return {
    heliusApiKey,
    cluster: (process.env.SCORER_CLUSTER as "mainnet" | "devnet") ?? "mainnet",
    attestationValiditySecs: Number(process.env.ATTESTATION_VALIDITY_SECS ?? 900),
    port: Number(process.env.PORT ?? 8787),
    maxTxPages: Number(process.env.MAX_TX_PAGES ?? 10),
    budgetMs: Number(process.env.MEASURE_BUDGET_MS ?? 30_000),
    keeperEnabled: process.env.KEEPER_ENABLED === "true",
    keeperRpcUrl:
      process.env.KEEPER_RPC_URL ??
      "https://devnet.helius-rpc.com/?api-key=" + (process.env.HELIUS_API_KEY ?? ""),
    keeperSecretKey: process.env.KEEPER_SECRET_KEY ?? "",
    keeperIntervalMs: Number(process.env.KEEPER_INTERVAL_MS ?? 1_800_000), // 30 min
    keeperMaxPerCycle: Number(process.env.KEEPER_MAX_PER_CYCLE ?? 25),
    jupApiKey: process.env.JUP_API_KEY ?? "",
  };
}
