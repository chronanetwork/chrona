export interface ScorerConfig {
  heliusApiKey: string;
  cluster: "mainnet" | "devnet";
  attestationValiditySecs: number;
  port: number;
  maxTxPages: number;
  budgetMs: number;
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
  };
}
