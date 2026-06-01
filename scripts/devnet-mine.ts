/**
 * Devnet dogfood: join as a miner with a signed oracle attestation, wait for
 * emission to accrue, then claim. Proves the full mining path on devnet.
 *
 *   npx tsx scripts/devnet-mine.ts
 */
import fs from "node:fs";
import path from "node:path";
import * as anchor from "@coral-xyz/anchor";
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  Ed25519Program,
  SYSVAR_INSTRUCTIONS_PUBKEY,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import {
  getAssociatedTokenAddress,
  getAccount,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import nacl from "tweetnacl";

const { AnchorProvider, Program, Wallet, BN } = anchor;
const DEVNET = "https://devnet.helius-rpc.com/?api-key=eea40423-0fd8-4254-aada-f627b5ff6a66";
const KEYS = path.join(__dirname, "..", "keys");
const SCORE = 5000;

const load = (n: string) =>
  Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(path.join(KEYS, n), "utf8"))));

function attestationMessage(wallet: PublicKey, score: number, expiry: number, nonce: Uint8Array): Buffer {
  const buf = Buffer.alloc(80);
  wallet.toBuffer().copy(buf, 0);
  buf.writeBigUInt64LE(BigInt(score), 32);
  buf.writeBigInt64LE(BigInt(expiry), 40);
  Buffer.from(nonce).copy(buf, 48);
  return buf;
}

async function main() {
  const connection = new Connection(DEVNET, "confirmed");
  const miner = load("deployer-keypair.json"); // dogfood with the deployer wallet
  const oracle = load("oracle-keypair.json");
  const mint = load("mint-keypair.json").publicKey;

  const provider = new AnchorProvider(connection, new Wallet(miner), { commitment: "confirmed" });
  const idl = JSON.parse(
    fs.readFileSync(path.join(__dirname, "..", "target", "idl", "kairo.json"), "utf8"),
  );
  const program = new Program(idl, provider);
  const pid = program.programId;

  const [globalPda] = PublicKey.findProgramAddressSync([Buffer.from("global-v2")], pid);
  const [mintAuthPda] = PublicKey.findProgramAddressSync([Buffer.from("mint_auth")], pid);
  const [minerPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("miner-v2"), miner.publicKey.toBuffer()],
    pid,
  );

  const existing = await connection.getAccountInfo(minerPda);
  if (!existing) {
    const expiry = Math.floor(Date.now() / 1000) + 900;
    const nonce = nacl.randomBytes(32);
    const message = attestationMessage(miner.publicKey, SCORE, expiry, nonce);
    const signature = nacl.sign.detached(message, oracle.secretKey);
    const edIx = Ed25519Program.createInstructionWithPublicKey({
      publicKey: oracle.publicKey.toBytes(),
      message,
      signature,
    });
    const ix = await program.methods
      .initializeMiner(new BN(SCORE), new BN(expiry), Array.from(nonce))
      .accountsPartial({
        owner: miner.publicKey,
        global: globalPda,
        miner: minerPda,
        treasury: miner.publicKey,
        instructionsSysvar: SYSVAR_INSTRUCTIONS_PUBKEY,
        systemProgram: SystemProgram.programId,
      })
      .instruction();
    const tx = new Transaction().add(edIx).add(ix);
    tx.feePayer = miner.publicKey;
    const sig = await sendAndConfirmTransaction(connection, tx, [miner]);
    console.log(`✔ joined as miner at hash rate ${SCORE}  (${sig})`);
  } else {
    console.log("• miner already initialized");
  }

  console.log("waiting 5s for emission to accrue...");
  await new Promise((r) => setTimeout(r, 5000));

  const ata = await getAssociatedTokenAddress(mint, miner.publicKey);
  const before = (await getAccount(connection, ata).catch(() => null))?.amount ?? 0n;
  const sig = await program.methods
    .claim()
    .accountsPartial({
      owner: miner.publicKey,
      global: globalPda,
      miner: minerPda,
      mint,
      mintAuthority: mintAuthPda,
      ownerTokenAccount: ata,
      tokenProgram: TOKEN_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .rpc();
  const after = (await getAccount(connection, ata)).amount;
  console.log(`✔ claimed (${sig})`);
  console.log(`KAIRO balance: ${Number(after) / 1e6} (mined ${Number(after - before) / 1e6})`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
