"use client";

import { useEffect, useMemo, useState } from "react";
import { useConnection } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { dailyEmissionKairo, MAX_SCORE, MIN_SCORE } from "@kairo/sdk";
import { fetchGlobal, getReadonlyProgram, previewScore } from "@/lib/kairo";

const fmt = (n: number, d = 0) =>
  Number.isFinite(n) ? n.toLocaleString(undefined, { maximumFractionDigits: d }) : "—";

export default function CalculatorPage() {
  const { connection } = useConnection();

  const [address, setAddress] = useState("");
  const [hr, setHr] = useState(2000);
  const [networkHr, setNetworkHr] = useState(100_000);
  const [baseNetworkHr, setBaseNetworkHr] = useState(0);
  const [genesisTs, setGenesisTs] = useState(0);
  const [active, setActive] = useState(false);
  const [breakdown, setBreakdown] = useState<any>(null);
  const [scoredWallet, setScoredWallet] = useState("");
  const [loading, setLoading] = useState(false);
  const [note, setNote] = useState("");

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
      .catch(() => setNote("Couldn't reach the network — showing example values."));
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
        "Couldn't score that wallet right now. You can still set a hash rate manually below.",
      );
    } finally {
      setLoading(false);
    }
  }

  const { elapsedDays, dailyNetwork, share, perDay } = useMemo(() => {
    const elapsed = genesisTs ? Math.max(0, Math.floor(Date.now() / 1000) - genesisTs) : 0;
    const dailyNetwork = active && genesisTs ? dailyEmissionKairo(elapsed) : 0;
    const share = networkHr > 0 ? hr / networkHr : hr > 0 ? 1 : 0;
    return { elapsedDays: elapsed / 86_400, dailyNetwork, share, perDay: dailyNetwork * share };
  }, [genesisTs, active, networkHr, hr]);

  return (
    <main className="container" style={{ paddingTop: 40 }}>
      <div className="section-head">
        <span className="eyebrow">Score &amp; earnings calculator</span>
        <h2>Check any wallet&apos;s hash rate</h2>
        <p>
          Paste any Solana address to see its score and project what it would mine at the current
          network rate. No wallet connection needed.
        </p>
      </div>

      <div className="narrow" style={{ display: "grid", gap: 16 }}>
        {/* Lookup */}
        <div className="card">
          <div className="field">
            <input
              className="input"
              placeholder="Paste any Solana wallet address…"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && lookup()}
            />
            <button className="btn" style={{ width: 120 }} disabled={loading} onClick={lookup}>
              {loading ? "…" : "Check"}
            </button>
          </div>
          {scoredWallet && breakdown && (
            <div style={{ marginTop: 20 }}>
              <div className="stat-big">{fmt(hr)}</div>
              <div className="stat-sub">
                hash rate · {scoredWallet.slice(0, 4)}…{scoredWallet.slice(-4)}
              </div>
              <div style={{ marginTop: 16 }}>
                <Factor label="Wallet age" v={breakdown.ageScore} />
                <Factor label="Trades" v={breakdown.tradeScore} />
                <Factor label="Volume" v={breakdown.volScore} />
                <Factor label="Hold time" v={breakdown.holdScore} />
              </div>
            </div>
          )}
          {note && <p className="msg">{note}</p>}
        </div>

        {/* Calculator */}
        <div className="card">
          <div className="calc-row">
            <label>
              Your hash rate
              <span className="hint">{MIN_SCORE}–{MAX_SCORE}</span>
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

          <div className="calc-row" style={{ marginTop: 20 }}>
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

          <div style={{ marginTop: 18 }}>
            <div className="kv">
              <span className="k">Network emits {active ? "now" : "(not live yet)"}</span>
              <span className="v">{fmt(dailyNetwork)} KAIRO / day</span>
            </div>
            <div className="kv">
              <span className="k">Your share of the pool</span>
              <span className="v">{(share * 100).toFixed(share < 0.01 ? 4 : 2)}%</span>
            </div>
            {active && (
              <div className="kv">
                <span className="k">Mining day</span>
                <span className="v">~{fmt(elapsedDays)}</span>
              </div>
            )}
          </div>
        </div>

        {/* Earnings */}
        <div className="card" style={{ textAlign: "center" }}>
          <div className="stat-sub" style={{ marginTop: 0 }}>you would mine</div>
          <div className="stat-big">{fmt(perDay, perDay < 10 ? 2 : 0)}</div>
          <div className="stat-sub">KAIRO / day</div>
          <div className="stat-grid">
            <Cell label="per week" v={perDay * 7} />
            <Cell label="per month" v={perDay * 30} />
            <Cell label="per year" v={perDay * 365} />
          </div>
          <p className="msg">
            Projection at the current emission rate. Earnings fall as the network grows or emission
            tapers, and rise as miners leave.
          </p>
        </div>
      </div>
    </main>
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

function Cell({ label, v }: { label: string; v: number }) {
  return (
    <div className="stat-cell">
      <div className="v">{fmt(v, v < 10 ? 2 : 0)}</div>
      <div className="l">{label}</div>
    </div>
  );
}
