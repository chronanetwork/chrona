"use client";

import { useCallback, useEffect, useState } from "react";
import { useConnection, useWallet, useAnchorWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { projectedDailyKairo } from "@kairo/sdk";
import {
  buildClaimTx,
  buildInitializeMinerTx,
  computeClaimableBase,
  fetchAttestation,
  fetchGlobal,
  fetchMiner,
  getProgram,
  previewScore,
} from "@/lib/kairo";

const fmt = (n: number, d = 4) =>
  n.toLocaleString(undefined, { maximumFractionDigits: d });

export function Mining() {
  const { connection } = useConnection();
  const { publicKey, sendTransaction } = useWallet();
  const anchorWallet = useAnchorWallet();

  const [global, setGlobal] = useState<any>(null);
  const [miner, setMiner] = useState<any>(null);
  const [preview, setPreview] = useState<any>(null);
  const [claimable, setClaimable] = useState(0);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const program = anchorWallet ? getProgram(connection, anchorWallet) : null;

  const refresh = useCallback(async () => {
    if (!program || !publicKey) return;
    try {
      const g = await fetchGlobal(program);
      setGlobal(g);
      const m = await fetchMiner(program, publicKey);
      setMiner(m);
    } catch (e: any) {
      setMsg(String(e.message ?? e));
    }
  }, [program, publicKey]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Score preview when connected and not yet mining.
  useEffect(() => {
    if (publicKey && !miner && !preview) {
      previewScore(publicKey.toBase58())
        .then(setPreview)
        .catch(() => setMsg("Scorer unavailable — set NEXT_PUBLIC_SCORER_URL."));
    }
  }, [publicKey, miner, preview]);

  // Live claimable ticker.
  useEffect(() => {
    if (!global || !miner) return;
    const tick = () =>
      setClaimable(Number(computeClaimableBase(global, miner, Math.floor(Date.now() / 1000))) / 1e6);
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [global, miner]);

  const onMine = async () => {
    if (!program || !publicKey) return;
    setBusy(true);
    setMsg("Requesting signed attestation…");
    try {
      const att = await fetchAttestation(publicKey.toBase58());
      setMsg("Approve the transaction to start mining…");
      const tx = await buildInitializeMinerTx(program, publicKey, att);
      const sig = await sendTransaction(tx, connection);
      await connection.confirmTransaction(sig, "confirmed");
      setMsg(`Mining! tx ${sig.slice(0, 8)}…`);
      await refresh();
    } catch (e: any) {
      setMsg(String(e.message ?? e));
    } finally {
      setBusy(false);
    }
  };

  const onClaim = async () => {
    if (!program || !publicKey) return;
    setBusy(true);
    setMsg("Approve the claim transaction…");
    try {
      const tx = await buildClaimTx(program, publicKey);
      const sig = await sendTransaction(tx, connection);
      await connection.confirmTransaction(sig, "confirmed");
      setMsg(`Claimed! tx ${sig.slice(0, 8)}…`);
      await refresh();
    } catch (e: any) {
      setMsg(String(e.message ?? e));
    } finally {
      setBusy(false);
    }
  };

  const totalHr = global ? Number(global.totalHashRate.toString()) : 0;
  const genesis = global ? Number(global.genesisTs.toString()) : 0;
  const elapsed = genesis ? Math.floor(Date.now() / 1000) - genesis : 0;
  const score = miner ? Number(miner.hashRate.toString()) : preview?.score ?? 0;
  const dailyProjection = projectedDailyKairo(score, totalHr || score || 1, elapsed);

  if (!publicKey) {
    return (
      <div className="panel" style={{ textAlign: "center" }}>
        <p className="sub">Connect a wallet to see your hash rate.</p>
        <WalletMultiButton />
      </div>
    );
  }

  return (
    <>
      <div className="panel">
        <div className="big">{fmt(score, 0)}</div>
        <div className="sub">{miner ? "your hash rate" : "your hash rate (preview)"}</div>

        {preview?.breakdown && !miner && (
          <>
            <Factor label="Wallet age" v={preview.breakdown.ageScore} />
            <Factor label="Trades" v={preview.breakdown.tradeScore} />
            <Factor label="Volume" v={preview.breakdown.volScore} />
            <Factor label="Hold time" v={preview.breakdown.holdScore} />
          </>
        )}

        <div className="row">
          <span className="k">Projected / day</span>
          <span>{fmt(dailyProjection)} KAIRO</span>
        </div>
        {global && (
          <div className="row">
            <span className="k">Network hash rate</span>
            <span>{fmt(totalHr, 0)}</span>
          </div>
        )}

        {!miner ? (
          <div style={{ marginTop: 16 }}>
            <button className="action" disabled={busy} onClick={onMine}>
              {busy ? "Working…" : "Start mining · 0.1 SOL"}
            </button>
          </div>
        ) : null}
      </div>

      {miner && (
        <div className="panel">
          <div className="sub" style={{ marginTop: 0 }}>claimable now</div>
          <div className="big">{fmt(claimable)}</div>
          <div className="sub">KAIRO</div>
          <button className="action" disabled={busy || claimable <= 0} onClick={onClaim}>
            {busy ? "Working…" : "Claim"}
          </button>
        </div>
      )}

      <div className="panel" style={{ display: "flex", justifyContent: "space-between" }}>
        <WalletMultiButton />
        <button
          onClick={refresh}
          style={{ background: "transparent", color: "var(--muted)", border: "none", cursor: "pointer" }}
        >
          refresh
        </button>
      </div>

      {msg && <p className="msg">{msg}</p>}
    </>
  );
}

function Factor({ label, v }: { label: string; v: number }) {
  return (
    <div className="row">
      <span className="k">{label}</span>
      <span style={{ width: 140 }}>
        <span className="bar">
          <span style={{ width: `${Math.round((v ?? 0) * 100)}%` }} />
        </span>
      </span>
    </div>
  );
}
