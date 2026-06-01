import { AnchorProvider, Program, BN, type Idl } from "@coral-xyz/anchor";
import {
  Connection,
  PublicKey,
  Transaction,
  Ed25519Program,
  SYSVAR_INSTRUCTIONS_PUBKEY,
  SystemProgram,
} from "@solana/web3.js";
import {
  getAssociatedTokenAddress,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import {
  MINT,
  PROGRAM_ID,
  attestationMessage,
  cumulativeEmissionKairo,
  globalPda,
  minerPda,
  mintAuthPda,
} from "@kairo/sdk";
import bs58 from "bs58";
import idl from "./kairo.idl.json";

export const RPC_URL =
  process.env.NEXT_PUBLIC_RPC_URL ??
  "https://mainnet.helius-rpc.com/?api-key=eea40423-0fd8-4254-aada-f627b5ff6a66";

export const SCORER_URL = process.env.NEXT_PUBLIC_SCORER_URL ?? "https://score.kairo.win";

export function getProgram(connection: Connection, wallet: any): Program {
  const provider = new AnchorProvider(connection, wallet, { commitment: "confirmed" });
  return new Program(idl as Idl, provider);
}

/** A read-only Program for fetching accounts without a connected wallet. */
export function getReadonlyProgram(connection: Connection): Program {
  const noopWallet = {
    publicKey: PublicKey.default,
    signTransaction: async (t: any) => t,
    signAllTransactions: async (t: any) => t,
  };
  const provider = new AnchorProvider(connection, noopWallet as any, {
    commitment: "confirmed",
  });
  return new Program(idl as Idl, provider);
}

export interface SignedAttestation {
  wallet: string;
  score: number;
  expiry: number;
  nonce: string; // base58
  signature: string; // base58
  oraclePubkey: string;
  breakdown?: any;
  measurement?: any;
}

const SCORER_TIMEOUT_MS = 45_000;

export interface MarketPrices {
  kairoUsd: number | null;
  kairoChange24h: number | null;
  solUsd: number | null;
}

/** Live $KAIRO + SOL prices (via the scorer's Jupiter proxy). */
export async function fetchPrices(): Promise<MarketPrices> {
  const res = await fetch(`${SCORER_URL}/price`, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`price: ${res.status}`);
  return res.json();
}

export interface LiveStats extends MarketPrices {
  active: boolean;
  totalHashRate: number;
  miners: number;
  minedKairo: number;
  genesisTs: number;
}

/** Combined live stats (price + on-chain network) from the scorer, cached server-side. */
export async function fetchStats(): Promise<LiveStats> {
  const res = await fetch(`${SCORER_URL}/stats`, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`stats: ${res.status}`);
  return res.json();
}

export interface BuybackBurnStats {
  devWallet: string;
  solBoughtBack: number;
  kairoBoughtBack: number;
  kairoBurned: number;
  buybackTxs: number;
  burnTxs: number;
  lastBuybackTs: number | null;
  lastBurnTs: number | null;
  txScanned: number;
  capped: boolean;
  updatedAt: number;
}

/** $KAIRO buyback + burn totals from the dev wallet (cached server-side). */
export async function fetchBuyback(): Promise<BuybackBurnStats> {
  const res = await fetch(`${SCORER_URL}/buyback`, { signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`buyback: ${res.status}`);
  return res.json();
}

/** Preview a wallet's score (no signature). */
export async function previewScore(wallet: string): Promise<any> {
  const res = await fetch(`${SCORER_URL}/score/${wallet}`, {
    signal: AbortSignal.timeout(SCORER_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`scorer: ${res.status}`);
  return res.json();
}

/** Fetch a signed attestation for a wallet. */
export async function fetchAttestation(wallet: string): Promise<SignedAttestation> {
  const res = await fetch(`${SCORER_URL}/score`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ wallet }),
    signal: AbortSignal.timeout(SCORER_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`scorer: ${res.status}`);
  return res.json();
}

export async function fetchGlobal(program: Program) {
  return (program.account as any).globalState.fetch(globalPda()[0]);
}

export async function fetchMiner(program: Program, owner: PublicKey) {
  try {
    return await (program.account as any).miner.fetch(minerPda(owner)[0]);
  } catch {
    return null;
  }
}

/** Build [ed25519_verify, initialize_miner] from a signed attestation. */
export async function buildInitializeMinerTx(
  program: Program,
  owner: PublicKey,
  att: SignedAttestation,
): Promise<Transaction> {
  const nonce = bs58.decode(att.nonce);
  const message = attestationMessage(owner, BigInt(att.score), BigInt(att.expiry), nonce);
  const edIx = Ed25519Program.createInstructionWithPublicKey({
    publicKey: new PublicKey(att.oraclePubkey).toBytes(),
    message,
    signature: bs58.decode(att.signature),
  });
  const ix = await program.methods
    .initializeMiner(new BN(att.score), new BN(att.expiry), Array.from(nonce))
    .accountsPartial({
      owner,
      global: globalPda()[0],
      miner: minerPda(owner)[0],
      treasury: (await fetchGlobal(program)).treasury,
      instructionsSysvar: SYSVAR_INSTRUCTIONS_PUBKEY,
      systemProgram: SystemProgram.programId,
    })
    .instruction();
  return new Transaction().add(edIx).add(ix);
}

export async function buildTopOffTx(program: Program, owner: PublicKey): Promise<Transaction> {
  const ix = await program.methods
    .topOff()
    .accountsPartial({
      owner,
      global: globalPda()[0],
      miner: minerPda(owner)[0],
      treasury: (await fetchGlobal(program)).treasury,
      systemProgram: SystemProgram.programId,
    })
    .instruction();
  return new Transaction().add(ix);
}

export async function buildClaimTx(program: Program, owner: PublicKey): Promise<Transaction> {
  const ata = await getAssociatedTokenAddress(MINT, owner);
  const ix = await program.methods
    .claim()
    .accountsPartial({
      owner,
      global: globalPda()[0],
      miner: minerPda(owner)[0],
      mint: MINT,
      mintAuthority: mintAuthPda()[0],
      ownerTokenAccount: ata,
      tokenProgram: TOKEN_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .instruction();
  return new Transaction().add(ix);
}

/**
 * Estimate a miner's claimable rewards in base units, mirroring the on-chain
 * accumulator (float emission preview — approximate, for display only).
 */
export function computeClaimableBase(global: any, miner: any, nowSecs: number): bigint {
  const Q64 = 2n ** 64n;
  const acc = BigInt(global.accRewardPerHash.toString());
  const total = BigInt(global.totalHashRate.toString());
  const genesis = BigInt(global.genesisTs.toString());
  const last = BigInt(global.lastUpdateTs.toString());

  let accNow = acc;
  if (total > 0n && BigInt(nowSecs) > last && genesis > 0n) {
    const elapNow = Number(BigInt(nowSecs) - genesis);
    const elapLast = Number(last - genesis);
    const dEkairo = cumulativeEmissionKairo(elapNow) - cumulativeEmissionKairo(elapLast);
    const dEbase = BigInt(Math.max(0, Math.floor(dEkairo * 1e6)));
    accNow = acc + (dEbase << 64n) / total;
  }
  const debt = BigInt(miner.rewardDebt.toString());
  const hr = BigInt(miner.hashRate.toString());
  const accrued = BigInt(miner.accruedBase.toString());
  const pending = ((accNow - debt) * hr) >> 64n;
  return accrued + pending;
}

export { PROGRAM_ID, MINT };
