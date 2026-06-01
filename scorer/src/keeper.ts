import * as anchor from "@coral-xyz/anchor";
import { Connection, Keypair } from "@solana/web3.js";
import bs58 from "bs58";
import { effectiveHashRate, globalPda } from "@kairo/sdk";
import idl from "./kairo.idl.json";

export interface KeeperConfig {
  rpcUrl: string;
  secretKey: string; // base58 string or JSON array
  intervalMs: number;
  maxPerCycle: number;
}

function loadKeypair(raw: string): Keypair {
  const t = raw.trim();
  if (t.startsWith("[")) return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(t)));
  return Keypair.fromSecretKey(bs58.decode(t));
}

/**
 * Pokes miners whose effective hashrate has decayed below what's currently
 * counted in the pool, settling their decay on-chain so abandoned/idle wallets
 * stop diluting active miners. Runs continuously alongside the scorer.
 */
export function startKeeper(cfg: KeeperConfig): void {
  const connection = new Connection(cfg.rpcUrl, "confirmed");
  const keeper = loadKeypair(cfg.secretKey);
  const wallet = {
    publicKey: keeper.publicKey,
    signTransaction: async (tx: any) => {
      tx.partialSign(keeper);
      return tx;
    },
    signAllTransactions: async (txs: any[]) => {
      txs.forEach((tx) => tx.partialSign(keeper));
      return txs;
    },
  };
  const provider = new anchor.AnchorProvider(connection, wallet as any, {
    commitment: "confirmed",
  });
  const program = new anchor.Program(idl as anchor.Idl, provider);
  const [global] = globalPda();

  console.log(`[keeper] enabled — poker ${keeper.publicKey.toBase58()}`);

  const cycle = async () => {
    try {
      const now = Math.floor(Date.now() / 1000);
      // Filter by the current account size so stale pre-upgrade (v1) miner
      // accounts — which share the discriminator but have the old layout — are
      // skipped instead of failing to decode.
      const size = (program.account as any).miner.size;
      const miners: any[] = await (program.account as any).miner.all([{ dataSize: size }]);
      const stale = miners.filter((m) => {
        const base = Number(m.account.hashRate);
        const stored = Number(m.account.effectiveHashRate);
        const last = Number(m.account.lastTopupTs);
        // Stale = its true effective rate has dropped below what the pool still credits it.
        return effectiveHashRate(base, last, now) < stored;
      });

      let poked = 0;
      for (const m of stale.slice(0, cfg.maxPerCycle)) {
        try {
          await program.methods
            .poke()
            .accountsPartial({ poker: keeper.publicKey, global, miner: m.publicKey })
            .rpc();
          poked += 1;
        } catch (e: any) {
          console.warn(`[keeper] poke ${m.publicKey.toBase58()} failed: ${e.message ?? e}`);
        }
      }
      if (stale.length) {
        console.log(`[keeper] ${miners.length} miners · ${stale.length} stale · poked ${poked}`);
      }
    } catch (e: any) {
      console.warn(`[keeper] cycle error: ${e.message ?? e}`);
    }
  };

  void cycle();
  setInterval(() => void cycle(), cfg.intervalMs);
}
