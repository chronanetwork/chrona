import { createServer } from "node:http";
import { PublicKey } from "@solana/web3.js";
import { loadConfig } from "./config";
import { measureWallet } from "./helius";
import { computeScore } from "./score";
import { loadOracleKeypair, signAttestation } from "./attest";
import { startKeeper } from "./keeper";
import { getMarketPrices } from "./marketPrice";
import { getNetworkStats } from "./networkStats";
import { getBuybackBurnStats } from "./buybackBurn";

const config = loadConfig();
const oracle = loadOracleKeypair();

function parseWallet(s: string): PublicKey | null {
  try {
    return new PublicKey(s);
  } catch {
    return null;
  }
}

async function scoreWallet(address: string) {
  const measurement = await measureWallet(address, {
    apiKey: config.heliusApiKey,
    cluster: config.cluster,
    maxTxPages: config.maxTxPages,
    budgetMs: config.budgetMs,
  });
  const breakdown = computeScore(measurement);
  return { measurement, breakdown };
}

const json = (res: any, code: number, body: unknown) => {
  const data = JSON.stringify(body, null, 2);
  res.writeHead(code, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
  res.end(data);
};

const server = createServer(async (req, res) => {
  try {
    // CORS preflight (the dapp POSTs application/json from a different origin).
    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Max-Age": "86400",
      });
      res.end();
      return;
    }

    const url = new URL(req.url ?? "/", "http://localhost");

    if (url.pathname === "/health") {
      return json(res, 200, { ok: true, oracle: oracle.publicKey.toBase58(), cluster: config.cluster });
    }

    // Live $KAIRO + SOL prices (Jupiter, proxied so the key stays server-side).
    if (url.pathname === "/price") {
      return json(res, 200, await getMarketPrices(config.jupApiKey));
    }

    // Combined live stats for the hero: price + on-chain network stats (cached).
    if (url.pathname === "/stats") {
      const [prices, net] = await Promise.all([
        getMarketPrices(config.jupApiKey),
        getNetworkStats(config.keeperRpcUrl),
      ]);
      return json(res, 200, { ...prices, ...net });
    }

    // $KAIRO buyback + burn tracker (dev wallet history, cached ~5 min).
    if (url.pathname === "/buyback") {
      return json(res, 200, await getBuybackBurnStats(config.heliusApiKey, config.devWallet, config.cluster));
    }

    // GET /score/:wallet  → free preview (no signature)
    if (req.method === "GET" && url.pathname.startsWith("/score/")) {
      const wallet = parseWallet(decodeURIComponent(url.pathname.slice("/score/".length)));
      if (!wallet) return json(res, 400, { error: "invalid wallet" });
      const { measurement, breakdown } = await scoreWallet(wallet.toBase58());
      return json(res, 200, {
        wallet: wallet.toBase58(),
        score: breakdown.hashRate,
        breakdown,
        measurement,
      });
    }

    // POST /score {wallet} → signed attestation
    if (req.method === "POST" && url.pathname === "/score") {
      const body = await readBody(req);
      const wallet = parseWallet(body?.wallet ?? "");
      if (!wallet) return json(res, 400, { error: "invalid wallet" });
      const { measurement, breakdown } = await scoreWallet(wallet.toBase58());
      const attestation = signAttestation(
        oracle,
        wallet,
        breakdown.hashRate,
        config.attestationValiditySecs,
      );
      return json(res, 200, { ...attestation, breakdown, measurement });
    }

    return json(res, 404, { error: "not found" });
  } catch (e: any) {
    return json(res, 500, { error: String(e?.message ?? e) });
  }
});

function readBody(req: any): Promise<any> {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (c: Buffer) => (data += c));
    req.on("end", () => {
      try {
        resolve(JSON.parse(data || "{}"));
      } catch {
        resolve({});
      }
    });
  });
}

server.listen(config.port, () => {
  console.log(`[scorer] listening on :${config.port}`);
  console.log(`[scorer] oracle pubkey ${oracle.publicKey.toBase58()}`);
  console.log(`[scorer] cluster ${config.cluster}`);
});

// Poke keeper runs alongside the scorer to prune decayed miners.
if (config.keeperEnabled && config.keeperSecretKey) {
  startKeeper({
    rpcUrl: config.keeperRpcUrl,
    secretKey: config.keeperSecretKey,
    intervalMs: config.keeperIntervalMs,
    maxPerCycle: config.keeperMaxPerCycle,
  });
} else {
  console.log("[keeper] disabled (set KEEPER_ENABLED=true and KEEPER_SECRET_KEY)");
}
