/**
 * Devnet bring-up for Kairo (idempotent):
 *   1. create the $KAIRO mint (vanity keypair), 6 decimals, deployer authority
 *   2. premine 100,000 KAIRO to the deployer (mainnet uses a DBC instead)
 *   3. initialize_global (oracle key, treasury, params)
 *   4. set_mint_authority -> program PDA, activating mining
 *
 * Run:  npx tsx scripts/devnet-bootstrap.ts
 */
import fs from "node:fs";
import path from "node:path";
import * as anchor from "@coral-xyz/anchor";
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
} from "@solana/web3.js";
import {
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
  getMint,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import bs58 from "bs58";

const { AnchorProvider, Program, Wallet, BN } = anchor;

const DEVNET = "https://devnet.helius-rpc.com/?api-key=eea40423-0fd8-4254-aada-f627b5ff6a66";
const DECIMALS = 6;
const PREMINE = 100_000 * 10 ** DECIMALS;
const FEE = 100_000_000; // 0.1 SOL
const KEYS = path.join(__dirname, "..", "keys");

function load(name: string): Keypair {
  return Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync(path.join(KEYS, name), "utf8"))),
  );
}

function loadOrCreate(name: string): Keypair {
  const p = path.join(KEYS, name);
  if (fs.existsSync(p)) return load(name);
  const kp = Keypair.generate();
  fs.writeFileSync(p, JSON.stringify(Array.from(kp.secretKey)));
  console.log(`generated ${name} -> ${kp.publicKey.toBase58()}`);
  return kp;
}

async function main() {
  const connection = new Connection(DEVNET, "confirmed");
  const deployer = load("deployer-keypair.json");
  const mintKp = load("mint-keypair.json");
  const oracle = loadOrCreate("oracle-keypair.json");
  const treasury = deployer.publicKey; // devnet: deployer doubles as treasury

  const provider = new AnchorProvider(connection, new Wallet(deployer), {
    commitment: "confirmed",
  });
  const idl = JSON.parse(
    fs.readFileSync(path.join(__dirname, "..", "target", "idl", "kairo.json"), "utf8"),
  );
  const program = new Program(idl, provider);
  const programId = program.programId;

  const [globalPda] = PublicKey.findProgramAddressSync([Buffer.from("global-v2")], programId);
  const [mintAuthPda] = PublicKey.findProgramAddressSync([Buffer.from("mint_auth")], programId);

  console.log("deployer:", deployer.publicKey.toBase58());
  console.log("mint:    ", mintKp.publicKey.toBase58());
  console.log("oracle:  ", oracle.publicKey.toBase58());
  console.log("global:  ", globalPda.toBase58());

  // 1. Mint
  const mintInfo = await connection.getAccountInfo(mintKp.publicKey);
  if (!mintInfo) {
    await createMint(connection, deployer, deployer.publicKey, null, DECIMALS, mintKp);
    console.log("✔ created mint");
  } else {
    console.log("• mint already exists");
  }

  // 2. Premine
  const mintState = await getMint(connection, mintKp.publicKey);
  if (mintState.supply === 0n) {
    const ata = await getOrCreateAssociatedTokenAccount(
      connection,
      deployer,
      mintKp.publicKey,
      deployer.publicKey,
    );
    await mintTo(connection, deployer, mintKp.publicKey, ata.address, deployer, PREMINE);
    console.log(`✔ premined ${PREMINE / 10 ** DECIMALS} KAIRO to deployer`);
  } else {
    console.log(`• supply already ${mintState.supply}`);
  }

  // 3. initialize_global
  const globalInfo = await connection.getAccountInfo(globalPda);
  if (!globalInfo) {
    await program.methods
      .initializeGlobal({
        oraclePubkey: oracle.publicKey,
        treasury,
        initFeeLamports: new BN(FEE),
        minScore: new BN(100),
        maxScore: new BN(10_000),
        attestationValiditySecs: new BN(900),
      })
      .accountsPartial({
        authority: deployer.publicKey,
        global: globalPda,
        mint: mintKp.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
    console.log("✔ initialized global");
  } else {
    console.log("• global already initialized");
  }

  // 4. set_mint_authority (activate)
  const g: any = await program.account.globalState.fetch(globalPda);
  if (!g.active) {
    await program.methods
      .setMintAuthority()
      .accountsPartial({
        authority: deployer.publicKey,
        global: globalPda,
        mint: mintKp.publicKey,
        mintAuthority: mintAuthPda,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();
    console.log("✔ handed mint authority to program PDA; mining ACTIVE");
  } else {
    console.log("• mining already active");
  }

  const final: any = await program.account.globalState.fetch(globalPda);
  console.log("\n=== Kairo devnet state ===");
  console.log("active:           ", final.active);
  console.log("genesis_ts:       ", final.genesisTs.toString());
  console.log("premine_observed: ", final.premineObserved.toString());
  console.log("total_hash_rate:  ", final.totalHashRate.toString());
  console.log("\nScorer env:");
  console.log(`  ORACLE_SECRET_KEY=${bs58.encode(oracle.secretKey)}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
