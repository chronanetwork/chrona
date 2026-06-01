import * as anchor from "@coral-xyz/anchor";
import { Connection, Keypair } from "@solana/web3.js";
import { cumulativeEmissionKairo, globalPda } from "@kairo/sdk";
import idl from "./kairo.idl.json";

export interface NetworkStats {
  active: boolean;
  totalHashRate: number;
  miners: number;
  minedKairo: number;
  genesisTs: number;
}

let cache: { ts: number; data: NetworkStats } | null = null;

/** On-chain network stats (cached ~30s) — pool hashrate, miner count, KAIRO mined. */
export async function getNetworkStats(rpcUrl: string): Promise<NetworkStats> {
  if (cache && Date.now() - cache.ts < 30_000) return cache.data;
  const empty: NetworkStats = { active: false, totalHashRate: 0, miners: 0, minedKairo: 0, genesisTs: 0 };
  try {
    const connection = new Connection(rpcUrl, "confirmed");
    const dummy = Keypair.generate();
    const wallet = {
      publicKey: dummy.publicKey,
      signTransaction: async (t: any) => t,
      signAllTransactions: async (t: any) => t,
    };
    const program = new anchor.Program(
      idl as anchor.Idl,
      new anchor.AnchorProvider(connection, wallet as any, { commitment: "confirmed" }),
    );
    const [g] = globalPda();
    const global: any = await (program.account as any).globalState.fetch(g).catch(() => null);
    if (!global) {
      cache = { ts: Date.now(), data: empty };
      return empty;
    }
    const minerClient: any = (program.account as any).miner;
    const accts: any[] = await minerClient.all([{ dataSize: minerClient.size }]).catch(() => []);
    const genesisTs = Number(global.genesisTs.toString());
    const elapsed = genesisTs ? Math.max(0, Math.floor(Date.now() / 1000) - genesisTs) : 0;
    const data: NetworkStats = {
      active: global.active,
      totalHashRate: Number(global.totalHashRate.toString()),
      miners: accts.length,
      minedKairo: global.active ? cumulativeEmissionKairo(elapsed) : 0,
      genesisTs,
    };
    cache = { ts: Date.now(), data };
    return data;
  } catch {
    return cache?.data ?? empty;
  }
}
