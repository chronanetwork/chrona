import { PublicKey } from "@solana/web3.js";

/** Length of the canonical attestation message. */
export const ATTESTATION_MSG_LEN = 80;

/**
 * Canonical attestation message — MUST match `ed25519::attestation_message`
 * in the on-chain program exactly:
 *
 *   wallet(32) ‖ score(u64 LE) ‖ expiry(i64 LE) ‖ nonce(32)
 */
export function attestationMessage(
  wallet: PublicKey,
  score: bigint | number,
  expiry: bigint | number,
  nonce: Uint8Array,
): Buffer {
  if (nonce.length !== 32) {
    throw new Error(`nonce must be 32 bytes, got ${nonce.length}`);
  }
  const buf = Buffer.alloc(ATTESTATION_MSG_LEN);
  wallet.toBuffer().copy(buf, 0);
  buf.writeBigUInt64LE(BigInt(score), 32);
  buf.writeBigInt64LE(BigInt(expiry), 40);
  Buffer.from(nonce).copy(buf, 48);
  return buf;
}
