import { randomBytes } from "node:crypto";
import { Keypair, PublicKey } from "@solana/web3.js";
import bs58 from "bs58";
import nacl from "tweetnacl";
import { attestationMessage } from "@kairo/sdk";

/**
 * Load the oracle signing keypair from the environment.
 * `ORACLE_SECRET_KEY` may be a base58 string or a JSON array of 64 bytes
 * (Solana keypair file format). If unset, an ephemeral key is generated and a
 * warning is logged (dev only — the on-chain `oracle_pubkey` must match).
 */
export function loadOracleKeypair(): Keypair {
  const raw = process.env.ORACLE_SECRET_KEY;
  if (!raw) {
    const kp = Keypair.generate();
    console.warn(
      `[scorer] WARNING: ORACLE_SECRET_KEY unset; using ephemeral oracle ${kp.publicKey.toBase58()}`,
    );
    return kp;
  }
  const trimmed = raw.trim();
  if (trimmed.startsWith("[")) {
    return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(trimmed)));
  }
  return Keypair.fromSecretKey(bs58.decode(trimmed));
}

export interface SignedAttestation {
  wallet: string;
  score: number;
  expiry: number; // unix seconds
  nonce: string; // base58 (32 bytes)
  signature: string; // base58 (64 bytes)
  oraclePubkey: string;
}

/** Sign `{wallet, score, expiry, nonce}` with the oracle key. */
export function signAttestation(
  oracle: Keypair,
  wallet: PublicKey,
  score: number,
  validitySecs: number,
  nowSecs: number = Math.floor(Date.now() / 1000),
): SignedAttestation {
  const expiry = nowSecs + validitySecs;
  const nonce = randomBytes(32);
  const message = attestationMessage(wallet, BigInt(score), BigInt(expiry), nonce);
  const signature = nacl.sign.detached(message, oracle.secretKey);
  return {
    wallet: wallet.toBase58(),
    score,
    expiry,
    nonce: bs58.encode(nonce),
    signature: bs58.encode(signature),
    oraclePubkey: oracle.publicKey.toBase58(),
  };
}
