"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useConnection, useWallet, useAnchorWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { effectiveHashRate, projectedDailyKairo } from "@kairo/sdk";
import { Window } from "@/components/Window";
import {
  buildClaimTx,
  buildInitializeMinerTx,
  buildTopOffTx,
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
  const [previewing, setPreviewing] = useState(false);
  const [claimable, setClaimable] = useState(0);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  // Stable program instance — only rebuilt when the wallet/connection changes.
  const program = useMemo(
    () => (anchorWallet ? getProgram(connection, anchorWallet) : null),
    [connection, anchorWallet],
  );

  const refresh = useCallback(async () => {
    if (!program || !publicKey) return;
    try {
      setGlobal(await fetchGlobal(program));
      setMiner(await fetchMiner(program, publicKey));
    } catch (e: any) {
      setMsg(String(e.message ?? e));
    }
  }, [program, publicKey]);

  // Fetch on connect, then poll gently (every 30s) — not on every render.
  useEffect(() => {
    if (!program || !publicKey) return;
    refresh();
    const id = setInterval(refresh, 30_000);
    return () => clearInterval(id);
  }, [program, publicKey, refresh]);

  // Free score preview once, when connected and not yet mining.
  const previewKey = publicKey?.toBase58();
  useEffect(() => {
    if (!previewKey || miner || preview || previewing) return;
    setPreviewing(true);
    previewScore(previewKey)
      .then(setPreview)
      .catch(() => setMsg("Couldn't reach the scorer right now — try again shortly."))
      .finally(() => setPreviewing(false));
  }, [previewKey, miner, preview, previewing]);

  // Live claimable ticker (pure client-side math — no RPC).
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
    setMsg("Requesting your signed score…");
    try {
      const att = await fetchAttestation(publicKey.toBase58());
      setMsg("Approve the transaction in your wallet to start mining…");
      const tx = await buildInitializeMinerTx(program, publicKey, att);
      const sig = await sendTransaction(tx, connection);
      await connection.confirmTransaction(sig, "confirmed");
      setMsg("You're mining! 🎉");
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
    setMsg("Approve the claim in your wallet…");
    try {
      const tx = await buildClaimTx(program, publicKey);
      const sig = await sendTransaction(tx, connection);
      await connection.confirmTransaction(sig, "confirmed");
      setMsg("Claimed — $KAIRO sent to your wallet.");
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
  const baseHr = miner ? Number(miner.hashRate.toString()) : preview?.score ?? 0;
  const lastTopup = miner ? Number(miner.lastTopupTs.toString()) : 0;
  const effHr = miner ? effectiveHashRate(baseHr, lastTopup) : baseHr;
  const displayScore = miner ? effHr : baseHr;
  const dailyProjection = projectedDailyKairo(effHr, totalHr || effHr || 1, elapsed);
  const bd = preview?.breakdown;

  const onTopOff = async () => {
    if (!program || !publicKey) return;
    setBusy(true);
    setMsg("Approve the top-off in your wallet…");
    try {
      const tx = await buildTopOffTx(program, publicKey);
      const sig = await sendTransaction(tx, connection);
      await connection.confirmTransaction(sig, "confirmed");
      setMsg("Topped off — hashrate restored to full.");
      await refresh();
    } catch (e: any) {
      setMsg(String(e.message ?? e));
    } finally {
      setBusy(false);
    }
  };

  if (!publicKey) {
    return (
      <Window title="KAIRO :: CONNECT" bodyStyle={{ textAlign: "center", padding: 30 }}>
        <h3 style={{ fontSize: 22 }}>Connect your wallet</h3>
        <p className="muted" style={{ margin: "8px auto 18px", maxWidth: "42ch", lineHeight: 1.55 }}>
          See your hash rate for free — no transaction, no commitment. Connecting only reads your
          public address.
        </p>
        <div style={{ display: "inline-flex" }}>
          <WalletMultiButton />
        </div>
      </Window>
    );
  }

  return (
    <div style={{ display: "grid", gap: 16 }}>
      {miner && (
        <Window title="KAIRO :: CLAIM" bodyStyle={{ textAlign: "center" }}>
          <div className="stat-sub" style={{ marginTop: 0 }}>claimable now</div>
          <div className="stat-big">{fmt(claimable)}</div>
          <div className="stat-sub">KAIRO · {fmt(dailyProjection)} / day</div>
          <button
            className="btn full"
            style={{ marginTop: 18 }}
            disabled={busy || claimable <= 0}
            onClick={onClaim}
          >
            {busy ? "Working…" : "Claim to wallet"}
          </button>
        </Window>
      )}

      <Window title={<>KAIRO :: SCORE{miner ? "" : " :: PREVIEW"}</>}>
        <div className="stat-big">{previewing && !displayScore ? "…" : fmt(displayScore, 0)}</div>
        <div className="stat-sub">{miner ? "effective hash rate" : "your hash rate · preview"}</div>

        {bd && !miner && (
          <div style={{ marginTop: 18 }}>
            <Factor label="age" v={bd.ageScore} />
            <Factor label="trades" v={bd.tradeScore} />
            <Factor label="volume" v={bd.volScore} />
            <Factor label="hold" v={bd.holdScore} />
          </div>
        )}

        <div style={{ marginTop: 14 }}>
          {miner && (
            <div className="kv">
              <span className="k">full hash rate</span>
              <span className="v">{fmt(baseHr, 0)}</span>
            </div>
          )}
          <div className="kv">
            <span className="k">projected / day</span>
            <span className="v">{fmt(dailyProjection)} KAIRO</span>
          </div>
          {global && (
            <div className="kv">
              <span className="k">network hash rate</span>
              <span className="v">{fmt(totalHr, 0)}</span>
            </div>
          )}
        </div>

        {!miner ? (
          <button className="btn full" style={{ marginTop: 18 }} disabled={busy} onClick={onMine}>
            {busy ? "Working…" : "Start mining · 0.1 SOL"}
          </button>
        ) : effHr < baseHr ? (
          <>
            <p className="msg" style={{ marginBottom: 0 }}>
              decayed to {fmt(effHr, 0)} of {fmt(baseHr, 0)} — halves every 36h
            </p>
            <button className="btn full" style={{ marginTop: 14 }} disabled={busy} onClick={onTopOff}>
              {busy ? "Working…" : "Top off · 0.02 SOL"}
            </button>
          </>
        ) : (
          <p className="msg" style={{ marginTop: 16, marginBottom: 0 }}>
            ◆ at full hashrate — halves 36h after your last top-off
          </p>
        )}
      </Window>

      {msg && <p className="msg">{msg}</p>}
    </div>
  );
}

function Factor({ label, v }: { label: string; v: number }) {
  return (
    <div className="factor">
      <span className="k">{label}</span>
      <span className="track">
        <span style={{ width: `${Math.round((v ?? 0) * 100)}%` }} />
      </span>
    </div>
  );
}
