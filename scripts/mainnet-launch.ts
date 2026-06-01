/**
 * Kairo MAINNET launch — hands the $KAIRO mint authority to the program and
 * starts mining. Idempotent and safe to re-run.
 *
 * Preconditions (do these first):
 *   1. The program is deployed + verified on mainnet (done).
 *   2. The DBC launch has CREATED the mint (keys/mint-keypair.json address) and
 *      premined supply, and LEFT mint authority with the deployer (not renounced).
 *
 * What it does:
 *   • preflight: checks balances, the mint, its current authority, and prints the plan
 *   • initialize_global (if not already) — records mint, oracle, treasury, params
 *   • set_mint_authority — moves mint authority to the program PDA and activates
 *     mining (this is emission genesis / "day 1")
 *
 * Usage:
 *   # dry run (prints the plan, changes nothing):
 *   npx tsx scripts/mainnet-launch.ts
 *   # execute:
 *   npx tsx scripts/mainnet-launch.ts --yes
 *
 * Env (optional):
 *   MAINNET_RPC      mainnet RPC url
 *   ORACLE_PUBKEY    oracle signer pubkey (defaults to keys/oracle-keypair.json)
 *   TREASURY         fee-receiving wallet (defaults to the deployer)
 */
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import * as anchor from "@coral-xyz/anchor";
import { Connection, Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import { getMint, TOKEN_PROGRAM_ID } from "@solana/spl-token";

const { AnchorProvider, Program, Wallet, BN } = anchor;

const RPC =
  process.env.MAINNET_RPC ??
  "https://mainnet.helius-rpc.com/?api-key=eea40423-0fd8-4254-aada-f627b5ff6a66";
const KEYS = path.join(__dirname, "..", "keys");
const EXECUTE = process.argv.includes("--yes");

// Launch params (match the on-chain defaults).
const INIT_FEE_LAMPORTS = 100_000_000; // 0.1 SOL
const MIN_SCORE = 100;
const MAX_SCORE = 10_000;
const ATTESTATION_VALIDITY_SECS = 900;

const load = (n: string): Keypair =>
  Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(path.join(KEYS, n), "utf8"))));

function fail(msg: string): never {
  console.error(`\n✖ ${msg}\n`);
  process.exit(1);
}

/** Read-back checks after launch — confirm the handover actually took. */
async function postLaunchChecks(
  connection: Connection,
  program: any,
  globalPda: PublicKey,
  mint: PublicKey,
  mintAuthPda: PublicKey,
): Promise<boolean> {
  console.log("\n=== sanity check ===");
  let pass = true;
  const m = await getMint(connection, mint);
  const authOk = m.mintAuthority?.equals(mintAuthPda) ?? false;
  console.log(`${authOk ? "✔" : "✖"} mint authority is the program PDA`);
  pass &&= authOk;
  const g: any = await program.account.globalState.fetch(globalPda);
  console.log(`${g.active ? "✔" : "✖"} mining active`);
  pass &&= g.active;
  const genOk = g.genesisTs.toNumber() > 0;
  console.log(`${genOk ? "✔" : "✖"} genesis_ts set (${g.genesisTs.toString()})`);
  pass &&= genOk;
  const supplyOk = Number(g.premineObserved) === Number(m.supply);
  console.log(
    `${supplyOk ? "✔" : "⚠"} premine_observed (${Number(g.premineObserved) / 1e6}) == supply (${Number(m.supply) / 1e6})`,
  );
  console.log(pass ? "\n✓ all checks passed — mining is LIVE" : "\n✖ checks FAILED — investigate before announcing");
  return pass;
}

/** Point the scorer's poke keeper at mainnet and restart it (best-effort, local). */
function repointKeeper(rpc: string): void {
  console.log("\n=== repoint keeper → mainnet ===");
  const envPath = path.join(__dirname, "..", "scorer", ".env.production");
  if (!fs.existsSync(envPath)) {
    console.log("  scorer/.env.production not found here — on the scorer host, set");
    console.log(`  KEEPER_RPC_URL=${rpc.split("?")[0]}?... and run: sudo systemctl restart kairo-scorer`);
    return;
  }
  let env = fs.readFileSync(envPath, "utf8");
  env = /^KEEPER_RPC_URL=/m.test(env)
    ? env.replace(/^KEEPER_RPC_URL=.*$/m, `KEEPER_RPC_URL=${rpc}`)
    : `${env.trimEnd()}\nKEEPER_RPC_URL=${rpc}\n`;
  if (!/^KEEPER_ENABLED=true/m.test(env)) {
    env = /^KEEPER_ENABLED=/m.test(env)
      ? env.replace(/^KEEPER_ENABLED=.*$/m, "KEEPER_ENABLED=true")
      : `${env.trimEnd()}\nKEEPER_ENABLED=true\n`;
  }
  fs.writeFileSync(envPath, env);
  console.log("  ✔ KEEPER_RPC_URL → mainnet in scorer/.env.production");
  try {
    execSync("sudo systemctl restart kairo-scorer", { stdio: "ignore" });
    console.log("  ✔ restarted kairo-scorer (keeper now pruning mainnet miners)");
  } catch {
    console.log("  ⚠ updated env but couldn't restart — run: sudo systemctl restart kairo-scorer");
  }
}

async function main() {
  const connection = new Connection(RPC, "confirmed");
  const deployer = load("deployer-keypair.json");
  const mint = load("mint-keypair.json").publicKey;
  const oracle = process.env.ORACLE_PUBKEY
    ? new PublicKey(process.env.ORACLE_PUBKEY)
    : load("oracle-keypair.json").publicKey;
  const treasury = process.env.TREASURY ? new PublicKey(process.env.TREASURY) : deployer.publicKey;

  const provider = new AnchorProvider(connection, new Wallet(deployer), { commitment: "confirmed" });
  const idl = JSON.parse(
    fs.readFileSync(path.join(__dirname, "..", "target", "idl", "kairo.json"), "utf8"),
  );
  const program = new Program(idl, provider);
  const pid = program.programId;

  const [globalPda] = PublicKey.findProgramAddressSync([Buffer.from("global-v2")], pid);
  const [mintAuthPda] = PublicKey.findProgramAddressSync([Buffer.from("mint_auth")], pid);

  // ---- preflight ----
  console.log("=== Kairo mainnet launch — preflight ===");
  console.log("rpc:           ", RPC.split("?")[0]);
  console.log("program:       ", pid.toBase58());
  console.log("deployer:      ", deployer.publicKey.toBase58());
  console.log("mint:          ", mint.toBase58());
  console.log("oracle:        ", oracle.toBase58());
  console.log("treasury:      ", treasury.toBase58());
  console.log("global PDA:    ", globalPda.toBase58());
  console.log("mint-auth PDA: ", mintAuthPda.toBase58());

  const bal = await connection.getBalance(deployer.publicKey);
  console.log("deployer balance:", (bal / 1e9).toFixed(4), "SOL");
  if (bal < 0.02e9) fail("Deployer balance too low for fees/rent.");

  const mintInfo = await connection.getAccountInfo(mint);
  if (!mintInfo) fail("Mint does not exist on mainnet yet — run the DBC launch first.");
  const mintState = await getMint(connection, mint);
  console.log("mint supply:   ", Number(mintState.supply) / 1e6, "KAIRO");
  const auth = mintState.mintAuthority?.toBase58() ?? "(none / renounced)";
  console.log("mint authority:", auth);

  const isDeployer = mintState.mintAuthority?.equals(deployer.publicKey) ?? false;
  const isPda = mintState.mintAuthority?.equals(mintAuthPda) ?? false;
  if (!isDeployer && !isPda) {
    fail(
      "Mint authority is neither the deployer nor the program PDA. The DBC must " +
        "leave mint authority with the deployer so it can be handed over. Cannot proceed.",
    );
  }

  const globalExists = !!(await connection.getAccountInfo(globalPda));
  let active = false;
  if (globalExists) {
    const g: any = await program.account.globalState.fetch(globalPda);
    active = g.active;
  }
  console.log("global initialized:", globalExists, "| mining active:", active);

  console.log("\nPlan:");
  console.log(globalExists ? "  • global already initialized" : "  • initialize_global");
  console.log(active ? "  • mining already active (nothing to do)" : "  • set_mint_authority → activate mining (emission genesis = now)");

  if (active) {
    console.log("\n✓ Already launched. Nothing to do.");
    return;
  }
  if (!EXECUTE) {
    console.log("\n(dry run) Re-run with --yes to execute the launch.");
    return;
  }

  // ---- execute ----
  if (!globalExists) {
    console.log("\n→ initialize_global …");
    await program.methods
      .initializeGlobal({
        oraclePubkey: oracle,
        treasury,
        initFeeLamports: new BN(INIT_FEE_LAMPORTS),
        minScore: new BN(MIN_SCORE),
        maxScore: new BN(MAX_SCORE),
        attestationValiditySecs: new BN(ATTESTATION_VALIDITY_SECS),
      })
      .accountsPartial({
        authority: deployer.publicKey,
        global: globalPda,
        mint,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
    console.log("  ✔ global initialized");
  }

  console.log("→ set_mint_authority (hand over + activate) …");
  await program.methods
    .setMintAuthority()
    .accountsPartial({
      authority: deployer.publicKey,
      global: globalPda,
      mint,
      mintAuthority: mintAuthPda,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .rpc();
  console.log("  ✔ mint authority handed to program; mining ACTIVE");

  // post-launch sanity check + repoint the keeper at mainnet
  await postLaunchChecks(connection, program, globalPda, mint, mintAuthPda);
  repointKeeper(RPC);

  console.log("\n=== LAUNCHED ===");
  console.log("The dapp's Start-mining button unlocks automatically on its next poll.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
