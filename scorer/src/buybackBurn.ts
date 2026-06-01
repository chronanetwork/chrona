import { getProtocolMetrics } from "./protocolMetrics";

export interface BuybackBurnStats {
  devWallet: string;
  solBoughtBack: number;
  kairoBoughtBack: number;
  kairoBurned: number;
  currentSupply: number;
  buybackTxs: number;
  burnTxs: number;
  lastBuybackTs: number | null;
  lastBurnTs: number | null;
  txScanned: number;
  capped: boolean;
  updatedAt: number;
}

/**
 * Buyback/burn totals for the public tracker — a projection of the richer
 * protocol metrics (single shared scan + cache).
 */
export async function getBuybackBurnStats(
  apiKey: string,
  devWallet: string,
  cluster: "mainnet" | "devnet" = "mainnet",
): Promise<BuybackBurnStats> {
  const m = await getProtocolMetrics(apiKey, devWallet, cluster);
  return {
    devWallet: m.devWallet,
    solBoughtBack: m.buybackSol,
    kairoBoughtBack: m.kairoBought,
    kairoBurned: m.kairoBurned,
    currentSupply: m.currentSupply,
    buybackTxs: m.buybackTxs,
    burnTxs: m.burnTxs,
    lastBuybackTs: m.lastBuybackTs,
    lastBurnTs: m.lastBurnTs,
    txScanned: m.txScanned,
    capped: m.capped,
    updatedAt: m.updatedAt,
  };
}
