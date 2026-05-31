import { PublicKey } from "@solana/web3.js";
import { GLOBAL_SEED, MINER_SEED, MINT_AUTH_SEED, PROGRAM_ID } from "./constants";

export function globalPda(programId: PublicKey = PROGRAM_ID): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([GLOBAL_SEED], programId);
}

export function minerPda(
  owner: PublicKey,
  programId: PublicKey = PROGRAM_ID,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([MINER_SEED, owner.toBuffer()], programId);
}

export function mintAuthPda(programId: PublicKey = PROGRAM_ID): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([MINT_AUTH_SEED], programId);
}
