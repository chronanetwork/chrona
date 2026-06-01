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
  /** Wallet that performs $KAIRO buybacks/burns (tracked on the dev dashboard). */
  devWallet: string;
  // buyback-and-burn flywheel
  flywheelEnabled: boolean;
  flywheelDryRun: boolean;
  flywheelSecretKey: string;
  flywheelRpcUrl: string;
  flywheelPayoutWallet: string;
  flywheelReserveSol: number;
  flywheelTriggerSol: number;
  flywheelIntervalMs: number;
  flywheelSlippageBps: number;
  flywheelMaxBuybackSol: number;
  flywheelFeeBufferSol: number;
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
    devWallet: process.env.DEV_WALLET ?? "B1xtqSHWRaGMpPkfgkFYPsLkvQKzF7pLUckTF53kairo",
    flywheelEnabled: process.env.FLYWHEEL_ENABLED === "true",
    flywheelDryRun: process.env.FLYWHEEL_DRY_RUN === "true",
    flywheelSecretKey: process.env.FLYWHEEL_SECRET_KEY ?? "",
    flywheelRpcUrl:
      process.env.FLYWHEEL_RPC_URL ??
      "https://mainnet.helius-rpc.com/?api-key=" + (process.env.HELIUS_API_KEY ?? ""),
    flywheelPayoutWallet:
      process.env.FLYWHEEL_PAYOUT_WALLET ?? "5c3BPQmhXo42CUEZHTSXiSJ5DmwhvGA8eGfvPgi9sAxh",
    flywheelReserveSol: Number(process.env.FLYWHEEL_RESERVE_SOL ?? 10),
    flywheelTriggerSol: Number(process.env.FLYWHEEL_TRIGGER_SOL ?? 11),
    flywheelIntervalMs: Number(process.env.FLYWHEEL_INTERVAL_MS ?? 300_000), // 5 min
    flywheelSlippageBps: Number(process.env.FLYWHEEL_SLIPPAGE_BPS ?? 300),
    flywheelMaxBuybackSol: Number(process.env.FLYWHEEL_MAX_BUYBACK_SOL ?? 0),
    flywheelFeeBufferSol: Number(process.env.FLYWHEEL_FEE_BUFFER_SOL ?? 0.03),
  };
}
