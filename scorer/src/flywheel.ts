import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  VersionedTransaction,
} from "@solana/web3.js";
import { createBurnInstruction, getAssociatedTokenAddressSync } from "@solana/spl-token";
import { MINT } from "@kairo/sdk";
import bs58 from "bs58";

const WSOL = "So11111111111111111111111111111111111111112";
const LAMPORTS_PER_SOL = 1_000_000_000;

export interface FlywheelConfig {
  rpcUrl: string;
  secretKey: string; // deployer/treasury key — base58 or JSON array
  payoutWallet: string; // 50% of excess is sent here
  reserveSol: number; // always kept in the wallet
  triggerSol: number; // act only when balance exceeds this
  intervalMs: number;
  slippageBps: number;
  maxBuybackSol: number; // per-cycle ceiling on the buyback leg (0 = no cap)
  feeBufferSol: number; // skimmed from the buyback leg to cover network fees
  jupApiKey: string;
  dryRun: boolean; // compute + log, never sign/send
}

function loadKeypair(raw: string): Keypair {
  const t = raw.trim();
  if (t.startsWith("[")) return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(t)));
  return Keypair.fromSecretKey(bs58.decode(t));
}

const sol = (lamports: number) => (lamports / LAMPORTS_PER_SOL).toFixed(4);

function jupBase(apiKey: string): string {
  return apiKey ? "https://api.jup.ag/swap/v1" : "https://lite-api.jup.ag/swap/v1";
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** fetch with retry+backoff on rate limits / transient 5xx (Jupiter gateway). */
async function jupFetch(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  let res: Response | null = null;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      res = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
      if (res.status !== 429 && res.status < 500) return res;
    } catch (e) {
      if (attempt === 3) throw e;
    }
    await sleep(700 * (attempt + 1)); // 0.7s, 1.4s, 2.1s
  }
  return res as Response;
}

/** SOL→$KAIRO ExactIn quote from Jupiter. */
async function jupQuote(cfg: FlywheelConfig, amountLamports: number): Promise<any> {
  const url =
    `${jupBase(cfg.jupApiKey)}/quote?inputMint=${WSOL}&outputMint=${MINT.toBase58()}` +
    `&amount=${amountLamports}&slippageBps=${cfg.slippageBps}&swapMode=ExactIn`;
  const res = await jupFetch(url, { headers: cfg.jupApiKey ? { "x-api-key": cfg.jupApiKey } : {} }, 12_000);
  if (!res.ok) throw new Error(`jup quote ${res.status}: ${await res.text().catch(() => "")}`);
  return res.json();
}

/** Build the (unsigned) versioned swap tx for a quote. */
async function jupSwapTx(cfg: FlywheelConfig, quote: any, userPk: string): Promise<VersionedTransaction> {
  const res = await jupFetch(
    `${jupBase(cfg.jupApiKey)}/swap`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(cfg.jupApiKey ? { "x-api-key": cfg.jupApiKey } : {}) },
      body: JSON.stringify({
        quoteResponse: quote,
        userPublicKey: userPk,
        wrapAndUnwrapSol: true,
        dynamicComputeUnitLimit: true,
        // Cap priority fees so a fee spike can never eat into the reserve.
        prioritizationFeeLamports: {
          priorityLevelWithMaxLamports: { maxLamports: 1_000_000, priorityLevel: "high" },
        },
      }),
    },
    12_000,
  );
  if (!res.ok) throw new Error(`jup swap ${res.status}: ${await res.text().catch(() => "")}`);
  const { swapTransaction } = await res.json();
  return VersionedTransaction.deserialize(Buffer.from(swapTransaction, "base64"));
}

async function kairoRaw(connection: Connection, ata: PublicKey): Promise<bigint> {
  const bal = await connection.getTokenAccountBalance(ata, "confirmed").catch(() => null);
  return bal?.value?.amount ? BigInt(bal.value.amount) : 0n;
}

/** Poll signature status until confirmed (or throw on timeout/error). */
async function confirm(connection: Connection, sig: string, timeoutMs = 60_000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const st = (await connection.getSignatureStatuses([sig])).value[0];
    if (st?.err) throw new Error(`tx ${sig} failed: ${JSON.stringify(st.err)}`);
    if (st?.confirmationStatus === "confirmed" || st?.confirmationStatus === "finalized") return;
    await new Promise((r) => setTimeout(r, 1500));
  }
  throw new Error(`tx ${sig} not confirmed within ${timeoutMs}ms`);
}

async function sendLegacy(connection: Connection, tx: Transaction, kp: Keypair): Promise<string> {
  const { blockhash } = await connection.getLatestBlockhash("confirmed");
  tx.recentBlockhash = blockhash;
  tx.feePayer = kp.publicKey;
  tx.sign(kp);
  const sig = await connection.sendRawTransaction(tx.serialize(), { maxRetries: 3 });
  await confirm(connection, sig);
  return sig;
}

let running = false;

async function runCycle(connection: Connection, kp: Keypair, cfg: FlywheelConfig): Promise<void> {
  const balance = await connection.getBalance(kp.publicKey, "confirmed");
  const reserve = Math.floor(cfg.reserveSol * LAMPORTS_PER_SOL);
  const trigger = Math.floor(cfg.triggerSol * LAMPORTS_PER_SOL);

  if (balance <= trigger) {
    console.log(`[flywheel] balance ${sol(balance)} SOL ≤ trigger ${cfg.triggerSol} — idle`);
    return;
  }

  const excess = balance - reserve;
  const half = Math.floor(excess / 2);
  const payout = half;
  const feeBuffer = Math.floor(cfg.feeBufferSol * LAMPORTS_PER_SOL);
  let buyback = half - feeBuffer;
  if (cfg.maxBuybackSol > 0) buyback = Math.min(buyback, Math.floor(cfg.maxBuybackSol * LAMPORTS_PER_SOL));

  if (buyback <= 0 || payout <= 0) {
    console.log(`[flywheel] excess ${sol(excess)} SOL too small after fee buffer — skip`);
    return;
  }

  console.log(
    `[flywheel] balance ${sol(balance)} | reserve ${cfg.reserveSol} | excess ${sol(excess)} ` +
      `→ payout ${sol(payout)} to ${cfg.payoutWallet} | buyback+burn ${sol(buyback)}`,
  );

  if (cfg.dryRun) {
    console.log("[flywheel] DRY RUN — no transactions sent");
    return;
  }

  const ata = getAssociatedTokenAddressSync(MINT, kp.publicKey);

  // 1) Buyback: SOL → $KAIRO via Jupiter. Done first so a swap failure aborts
  //    the cycle before any payout (keeps the 50/50 split honest on retry).
  const pre = await kairoRaw(connection, ata);
  const quote = await jupQuote(cfg, buyback);
  const swapTx = await jupSwapTx(cfg, quote, kp.publicKey.toBase58());
  swapTx.sign([kp]);
  const swapSig = await connection.sendRawTransaction(swapTx.serialize(), { maxRetries: 3 });
  await confirm(connection, swapSig);
  const post = await kairoRaw(connection, ata);
  const bought = post - pre;
  console.log(`[flywheel] bought ${Number(bought) / 1e6} KAIRO (${swapSig})`);

  // 2) Burn exactly what was just bought.
  if (bought > 0n) {
    const burnTx = new Transaction().add(
      createBurnInstruction(ata, MINT, kp.publicKey, bought),
    );
    const burnSig = await sendLegacy(connection, burnTx, kp);
    console.log(`[flywheel] burned ${Number(bought) / 1e6} KAIRO (${burnSig})`);
  } else {
    console.warn("[flywheel] swap produced no measurable $KAIRO — skipping burn");
  }

  // 3) Payout the other half of the excess.
  const payoutTx = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: kp.publicKey,
      toPubkey: new PublicKey(cfg.payoutWallet),
      lamports: payout,
    }),
  );
  const payoutSig = await sendLegacy(connection, payoutTx, kp);
  console.log(`[flywheel] sent ${sol(payout)} SOL payout (${payoutSig})`);
}

/**
 * Buyback-and-burn flywheel. Every cycle: if the wallet holds more than the
 * trigger, keep a fixed SOL reserve, send half the excess to the payout wallet,
 * and buy back $KAIRO with the other half — then burn it. Init/top-off fees
 * accumulating in the treasury thus turn into continuous $KAIRO deflation.
 */
export function startFlywheel(cfg: FlywheelConfig): void {
  const kp = loadKeypair(cfg.secretKey);
  new PublicKey(cfg.payoutWallet); // validate early
  const connection = new Connection(cfg.rpcUrl, "confirmed");

  console.log(
    `[flywheel] ${cfg.dryRun ? "DRY RUN " : ""}enabled — wallet ${kp.publicKey.toBase58()} | ` +
      `reserve ${cfg.reserveSol} SOL | trigger ${cfg.triggerSol} SOL | every ${cfg.intervalMs / 1000}s`,
  );

  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await runCycle(connection, kp, cfg);
    } catch (e: any) {
      console.warn(`[flywheel] cycle error: ${e?.message ?? e}`);
    } finally {
      running = false;
    }
  };

  void tick();
  setInterval(() => void tick(), cfg.intervalMs);
}
