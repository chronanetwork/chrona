// CommonJS packages: default-import then destructure (works whether this file
// is loaded as ESM via Node's native TS loader or transpiled to CJS).
import anchor from "@coral-xyz/anchor";
const { Program, BN } = anchor;
import {
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  Ed25519Program,
  SYSVAR_INSTRUCTIONS_PUBKEY,
  sendAndConfirmTransaction,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import {
  createMint,
  createAssociatedTokenAccount,
  mintTo,
  getAssociatedTokenAddress,
  getAccount,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import naclPkg from "tweetnacl";
const nacl = naclPkg;
import chai from "chai";
const { assert } = chai;

const PROGRAM_ID = new PublicKey("6MS8n87aRsXE5RjyVXuf9wcfARn5ut4m2YhBFE3kairo");
const DECIMALS = 6;
const ONE_KAIRO = 1_000_000;
const PREMINE = 100_000 * ONE_KAIRO;
const FEE = 0.1 * LAMPORTS_PER_SOL;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Canonical attestation message: wallet(32) ‖ score(u64 LE) ‖ expiry(i64 LE) ‖ nonce(32)
function attestationMessage(wallet: PublicKey, score: number, expiry: number, nonce: Uint8Array): Buffer {
  const buf = Buffer.alloc(80);
  wallet.toBuffer().copy(buf, 0);
  buf.writeBigUInt64LE(BigInt(score), 32);
  buf.writeBigInt64LE(BigInt(expiry), 40);
  Buffer.from(nonce).copy(buf, 48);
  return buf;
}

describe("kairo", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.Kairo as Program;
  const connection = provider.connection;

  const authority = (provider.wallet as anchor.Wallet).payer; // deployer
  const oracle = Keypair.generate();
  const treasury = Keypair.generate();

  const [globalPda] = PublicKey.findProgramAddressSync([Buffer.from("global")], PROGRAM_ID);
  const [mintAuthPda] = PublicKey.findProgramAddressSync([Buffer.from("mint_auth")], PROGRAM_ID);

  let mint: PublicKey;

  const minerPda = (owner: PublicKey) =>
    PublicKey.findProgramAddressSync([Buffer.from("miner"), owner.toBuffer()], PROGRAM_ID)[0];

  async function fund(pubkey: PublicKey, sol = 5) {
    const sig = await connection.requestAirdrop(pubkey, sol * LAMPORTS_PER_SOL);
    await connection.confirmTransaction(sig);
  }

  // Build [ed25519_verify, ix] and send, signed by `signer`.
  async function sendWithAttestation(
    ix: anchor.web3.TransactionInstruction,
    signer: Keypair,
    oracleKp: Keypair,
    message: Buffer,
  ) {
    const signature = nacl.sign.detached(message, oracleKp.secretKey);
    const edIx = Ed25519Program.createInstructionWithPublicKey({
      publicKey: oracleKp.publicKey.toBytes(),
      message,
      signature,
    });
    const tx = new Transaction().add(edIx).add(ix);
    tx.feePayer = signer.publicKey;
    return sendAndConfirmTransaction(connection, tx, [signer]);
  }

  async function initMiner(user: Keypair, score: number, opts?: { oracleKp?: Keypair; expiry?: number; message?: Buffer }) {
    const expiry = opts?.expiry ?? Math.floor(Date.now() / 1000) + 600;
    const nonce = nacl.randomBytes(32);
    const message = opts?.message ?? attestationMessage(user.publicKey, score, expiry, nonce);
    const ix = await program.methods
      .initializeMiner(new BN(score), new BN(expiry), Array.from(nonce))
      .accountsPartial({
        owner: user.publicKey,
        global: globalPda,
        miner: minerPda(user.publicKey),
        treasury: treasury.publicKey,
        instructionsSysvar: SYSVAR_INSTRUCTIONS_PUBKEY,
        systemProgram: SystemProgram.programId,
      })
      .instruction();
    return sendWithAttestation(ix, user, opts?.oracleKp ?? oracle, message);
  }

  before(async () => {
    await fund(authority.publicKey, 100);
    // KAIRO mint, deployer is initial mint authority (stand-in for DBC on mainnet).
    mint = await createMint(connection, authority, authority.publicKey, null, DECIMALS);
    // Premine 100k to the deployer (devnet-style; mainnet premine comes from the DBC).
    const ata = await getAssociatedTokenAddress(mint, authority.publicKey);
    await createAssociatedTokenAccount(connection, authority, mint, authority.publicKey);
    await mintTo(connection, authority, mint, ata, authority, PREMINE);
  });

  it("initializes global config + records the mint", async () => {
    await program.methods
      .initializeGlobal({
        oraclePubkey: oracle.publicKey,
        treasury: treasury.publicKey,
        initFeeLamports: new BN(FEE),
        minScore: new BN(100),
        maxScore: new BN(10_000),
        attestationValiditySecs: new BN(900),
      })
      .accountsPartial({
        authority: authority.publicKey,
        global: globalPda,
        mint,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const g = await program.account.globalState.fetch(globalPda);
    assert.isTrue(g.mint.equals(mint));
    assert.isTrue(g.oraclePubkey.equals(oracle.publicKey));
    assert.isFalse(g.active);
  });

  it("hands mint authority to the program PDA and activates mining", async () => {
    await program.methods
      .setMintAuthority()
      .accountsPartial({
        authority: authority.publicKey,
        global: globalPda,
        mint,
        mintAuthority: mintAuthPda,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();

    const g = await program.account.globalState.fetch(globalPda);
    assert.isTrue(g.active);
    assert.equal(g.premineObserved.toString(), PREMINE.toString());
    assert.isTrue(g.genesisTs.toNumber() > 0);
  });

  it("rejects an attestation signed by the wrong key", async () => {
    const user = Keypair.generate();
    await fund(user.publicKey);
    const wrongOracle = Keypair.generate();
    try {
      await initMiner(user, 4000, { oracleKp: wrongOracle });
      assert.fail("should have rejected wrong oracle");
    } catch (e: any) {
      assert.match(String(e), /AttestationMismatch|custom program error/i);
    }
  });

  it("rejects an expired attestation", async () => {
    const user = Keypair.generate();
    await fund(user.publicKey);
    const expiry = Math.floor(Date.now() / 1000) - 10;
    try {
      await initMiner(user, 4000, { expiry });
      assert.fail("should have rejected expired attestation");
    } catch (e: any) {
      assert.match(String(e), /AttestationExpired|custom program error/i);
    }
  });

  it("rejects a tampered message (score in ix != signed score)", async () => {
    const user = Keypair.generate();
    await fund(user.publicKey);
    const expiry = Math.floor(Date.now() / 1000) + 600;
    const nonce = nacl.randomBytes(32);
    // Sign for score 100 but submit score 9000 in the instruction.
    const signedMsg = attestationMessage(user.publicKey, 100, expiry, nonce);
    const ix = await program.methods
      .initializeMiner(new BN(9000), new BN(expiry), Array.from(nonce))
      .accountsPartial({
        owner: user.publicKey,
        global: globalPda,
        miner: minerPda(user.publicKey),
        treasury: treasury.publicKey,
        instructionsSysvar: SYSVAR_INSTRUCTIONS_PUBKEY,
        systemProgram: SystemProgram.programId,
      })
      .instruction();
    try {
      await sendWithAttestation(ix, user, oracle, signedMsg);
      assert.fail("should have rejected tampered message");
    } catch (e: any) {
      assert.match(String(e), /AttestationMismatch|custom program error/i);
    }
  });

  it("initializes a miner with a valid attestation and charges the fee", async () => {
    const user = Keypair.generate();
    await fund(user.publicKey, 1);
    const treasuryBefore = await connection.getBalance(treasury.publicKey);

    await initMiner(user, 4000);

    const m = await program.account.miner.fetch(minerPda(user.publicKey));
    assert.equal(m.hashRate.toString(), "4000");
    const g = await program.account.globalState.fetch(globalPda);
    assert.equal(g.totalHashRate.toString(), "4000");
    const treasuryAfter = await connection.getBalance(treasury.publicKey);
    assert.equal(treasuryAfter - treasuryBefore, FEE);
  });

  it("accrues and claims mined KAIRO", async () => {
    const user = Keypair.generate();
    await fund(user.publicKey, 1);
    await initMiner(user, 8000);

    await sleep(3000); // let emission accrue

    const ata = await getAssociatedTokenAddress(mint, user.publicKey);
    await program.methods
      .claim()
      .accountsPartial({
        owner: user.publicKey,
        global: globalPda,
        miner: minerPda(user.publicKey),
        mint,
        mintAuthority: mintAuthPda,
        ownerTokenAccount: ata,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([user])
      .rpc();

    const acct = await getAccount(connection, ata);
    assert.isTrue(acct.amount > 0n, "should have minted some KAIRO");
  });

  it("re-attest changes hash rate and total", async () => {
    const user = Keypair.generate();
    await fund(user.publicKey, 1);
    await initMiner(user, 2000);
    const gBefore = await program.account.globalState.fetch(globalPda);

    const expiry = Math.floor(Date.now() / 1000) + 600;
    const nonce = nacl.randomBytes(32);
    const message = attestationMessage(user.publicKey, 6000, expiry, nonce);
    const ix = await program.methods
      .reAttest(new BN(6000), new BN(expiry), Array.from(nonce))
      .accountsPartial({
        owner: user.publicKey,
        global: globalPda,
        miner: minerPda(user.publicKey),
        instructionsSysvar: SYSVAR_INSTRUCTIONS_PUBKEY,
      })
      .instruction();
    await sendWithAttestation(ix, user, oracle, message);

    const m = await program.account.miner.fetch(minerPda(user.publicKey));
    assert.equal(m.hashRate.toString(), "6000");
    const gAfter = await program.account.globalState.fetch(globalPda);
    assert.equal(
      gAfter.totalHashRate.toNumber() - gBefore.totalHashRate.toNumber(),
      4000,
    );
  });

  it("pause blocks new miners; unpause restores", async () => {
    await program.methods
      .setPaused(true)
      .accountsPartial({ authority: authority.publicKey, global: globalPda })
      .rpc();

    const user = Keypair.generate();
    await fund(user.publicKey, 1);
    try {
      await initMiner(user, 3000);
      assert.fail("should be paused");
    } catch (e: any) {
      assert.match(String(e), /Paused|custom program error/i);
    }

    await program.methods
      .setPaused(false)
      .accountsPartial({ authority: authority.publicKey, global: globalPda })
      .rpc();
    await initMiner(user, 3000); // now succeeds
  });

  it("rejects admin calls from a non-authority", async () => {
    const attacker = Keypair.generate();
    await fund(attacker.publicKey, 1);
    try {
      await program.methods
        .setOracle(attacker.publicKey)
        .accountsPartial({ authority: attacker.publicKey, global: globalPda })
        .signers([attacker])
        .rpc();
      assert.fail("non-authority should not set oracle");
    } catch (e: any) {
      assert.match(String(e), /Unauthorized|has_one|custom program error/i);
    }
  });
});
