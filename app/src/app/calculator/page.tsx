"use client";

import { useEffect, useMemo, useState } from "react";
import { useConnection } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { dailyEmissionKairo, MAX_SCORE, MIN_SCORE } from "@kairo/sdk";
import { fetchGlobal, getReadonlyProgram, previewScore } from "@/lib/kairo";

const fmt = (n: number, d = 0) =>
  Number.isFinite(n)
    ? n.toLocaleString(undefined, { maximumFractionDigits: d })
    : "—";

export default function CalculatorPage() {
  const { connection } = useConnection();

  const [address, setAddress] = useState("");
  const [hr, setHr] = useState(2000); // hash rate used in the calc (editable)
  const [networkHr, setNetworkHr] = useState(100_000);
  const [baseNetworkHr, setBaseNetworkHr] = useState(0);
  const [genesisTs, setGenesisTs] = useState(0);
  const [active, setActive] = useState(false);
  const [breakdown, setBreakdown] = useState<any>(null);
  const [scoredWallet, setScoredWallet] = useState("");
  const [loading, setLoading] = useState(false);
  const [note, setNote] = useState("");

  // Load live network state (read-only, no wallet needed).
  useEffect(() => {
    const program = getReadonlyProgram(connection);
    fetchGlobal(program)
      .then((g: any) => {
        setGenesisTs(Number(g.genesisTs.toString()));
        setActive(g.active);
        const total = Number(g.totalHashRate.toString());
        setBaseNetworkHr(total);
        setNetworkHr((prev) => (prev === 100_000 ? Math.max(total, hr) : prev));
      })
      .catch(() => setNote("Couldn't reach the network — using example values."));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connection]);

  async function lookup() {
    setNote("");
    setBreakdown(null);
    try {
      new PublicKey(address.trim());
    } catch {
      setNote("That doesn't look like a valid Solana address.");
      return;
    }
    setLoading(true);
    try {
      const res = await previewScore(address.trim());
      setHr(res.score);
      setBreakdown(res.breakdown);
      setScoredWallet(address.trim());
      setNetworkHr(Math.max(baseNetworkHr + res.score, res.score));
    } catch {
      setNote(
        "Couldn't score that wallet — the scorer may be offline. You can still set a hash rate manually below to use the calculator.",
      );
    } finally {
      setLoading(false);
    }
  }

  const { elapsedDays, dailyNetwork, share, perDay } = useMemo(() => {
    const elapsed = genesisTs ? Math.max(0, Math.floor(Date.now() / 1000) - genesisTs) : 0;
    const dailyNetwork = active && genesisTs ? dailyEmissionKairo(elapsed) : 0;
    const share = networkHr > 0 ? hr / networkHr : hr > 0 ? 1 : 0;
    return {
      elapsedDays: elapsed / 86_400,
      dailyNetwork,
      share,
      perDay: dailyNetwork * share,
    };
  }, [genesisTs, active, networkHr, hr]);

  return (
    <main className="container">
      <div className="brand">
        <h1>Kairo</h1>
        <a href="/" style={{ color: "var(--muted)", fontSize: 13 }}>
          ← mine
        </a>
      </div>
      <p className="tag">
        <strong>Score &amp; earnings calculator.</strong> Check any wallet&apos;s hash rate and see
        what it would mine at the current network rate. No wallet connection needed.
      </p>

      {/* Wallet lookup */}
      <div className="panel">
        <div className="field">
          <input
            className="input"
            placeholder="Paste any Solana wallet address…"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && lookup()}
          />
          <button className="action" style={{ width: 120 }} disabled={loading} onClick={lookup}>
            {loading ? "…" : "Check"}
          </button>
        </div>
        {scoredWallet && breakdown && (
          <>
            <div className="big">{fmt(hr)}</div>
            <div className="sub">
              hash rate for {scoredWallet.slice(0, 4)}…{scoredWallet.slice(-4)}
            </div>
            <Factor label="Wallet age" v={breakdown.ageScore} />
            <Factor label="Trades" v={breakdown.tradeScore} />
            <Factor label="Volume" v={breakdown.volScore} />
            <Factor label="Hold time" v={breakdown.holdScore} />
          </>
        )}
        {note && <p className="msg">{note}</p>}
      </div>

      {/* Calculator */}
      <div className="panel">
        <div className="calc-row">
          <label>
            Your hash rate
            <span className="hint">
              {MIN_SCORE}–{MAX_SCORE}
            </span>
          </label>
          <input
            className="input num"
            type="number"
            value={hr}
            min={0}
            onChange={(e) => setHr(Math.max(0, Number(e.target.value)))}
          />
        </div>
        <input
          type="range"
          min={MIN_SCORE}
          max={MAX_SCORE}
          value={Math.min(hr, MAX_SCORE)}
          onChange={(e) => setHr(Number(e.target.value))}
        />

        <div className="calc-row" style={{ marginTop: 18 }}>
          <label>
            Network hash rate
            <span className="hint">everyone mining (incl. you)</span>
          </label>
          <input
            className="input num"
            type="number"
            value={networkHr}
            min={1}
            onChange={(e) => setNetworkHr(Math.max(1, Number(e.target.value)))}
          />
        </div>
        <input
          type="range"
          min={Math.max(hr, 1)}
          max={2_000_000}
          value={Math.min(networkHr, 2_000_000)}
          onChange={(e) => setNetworkHr(Number(e.target.value))}
        />

        <div className="row" style={{ marginTop: 18 }}>
          <span className="k">Network emits {active ? "now" : "(not live yet)"}</span>
          <span>{fmt(dailyNetwork)} KAIRO / day</span>
        </div>
        <div className="row">
          <span className="k">Your share of the pool</span>
          <span>{(share * 100).toFixed(share < 0.01 ? 4 : 2)}%</span>
        </div>
        {active && (
          <div className="row">
            <span className="k">Mining day</span>
            <span>~{fmt(elapsedDays)}</span>
          </div>
        )}
      </div>

      {/* Earnings */}
      <div className="panel">
        <div className="sub" style={{ marginTop: 0 }}>you would mine</div>
        <div className="big">{fmt(perDay, perDay < 10 ? 2 : 0)}</div>
        <div className="sub">KAIRO / day</div>
        <div className="stat-grid">
          <Stat label="per week" v={perDay * 7} />
          <Stat label="per month" v={perDay * 30} />
          <Stat label="per year" v={perDay * 365} />
        </div>
        <p className="msg">
          Projection at the current emission rate and the hash rates above. Earnings fall as the
          network grows or emission tapers; they rise if miners leave.
        </p>
      </div>

      <p className="msg" style={{ textAlign: "center", marginTop: 12 }}>
        <a href="https://github.com/KairoMine/kairo" target="_blank" rel="noreferrer">
          open source on GitHub
        </a>
      </p>
    </main>
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

function Stat({ label, v }: { label: string; v: number }) {
  return (
    <div className="stat">
      <div className="stat-v">{fmt(v, v < 10 ? 2 : 0)}</div>
      <div className="stat-l">{label}</div>
    </div>
  );
}
