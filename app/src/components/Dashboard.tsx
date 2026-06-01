"use client";

import { useEffect, useState } from "react";
import { fetchMetrics, type ProtocolMetrics, type SeriesPoint } from "@/lib/kairo";
import { Window } from "@/components/Window";
import { FlowChart } from "@/components/charts";

const num = (n: number | null | undefined, d = 0) =>
  n != null && Number.isFinite(n) ? n.toLocaleString(undefined, { maximumFractionDigits: d }) : "—";

const usd = (n: number | null | undefined) =>
  n == null || !Number.isFinite(n)
    ? null
    : n < 0.01
      ? `$${n.toPrecision(2)}`
      : `$${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

const pct = (n: number) => `${n.toFixed(n > 0 && n < 0.01 ? 4 : 2)}%`;
const hourLabel = (t: string) => `${t.slice(11, 13)}:00`;
const dayLabel = (t: string) => t.slice(5, 10);

export function Dashboard() {
  const [m, setM] = useState<ProtocolMetrics | null>(null);
  const [err, setErr] = useState(false);

  useEffect(() => {
    let alive = true;
    const load = () =>
      fetchMetrics()
        .then((d) => alive && (setM(d), setErr(false)))
        .catch(() => alive && setErr(true));
    load();
    const id = setInterval(load, 60_000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  const solUsd = m?.solUsd ?? null;
  const kairoUsd = m?.kairoUsd ?? null;
  const burnPct = m && m.currentSupply > 0 ? (m.kairoBurned / m.currentSupply) * 100 : null;

  // Trim the hourly series to where activity begins, so the charts look full.
  const hourly = m?.hourly ?? [];
  const active = (p: SeriesPoint) => p.feesSol > 0 || p.buybackSol > 0 || p.kairoBurned > 0;
  let start = hourly.findIndex(active);
  if (start < 0) start = Math.max(0, hourly.length - 12);
  else start = Math.max(0, start - 1);
  const series = hourly.slice(start);
  const span =
    series.length > 0 ? `${hourLabel(series[0].t)} → ${hourLabel(series[series.length - 1].t)} UTC` : "";

  return (
    <main className="container" style={{ paddingTop: 36 }}>
      <div className="section-head" style={{ marginBottom: 18 }}>
        <span className="eyebrow">Live protocol stats</span>
        <h2 style={{ fontSize: "clamp(32px,5vw,50px)" }}>What the network collects and burns</h2>
        <p>
          Mining fees fund a buyback-and-burn flywheel. Everything here is read straight from
          on-chain history and refreshes automatically.{" "}
          {err && m == null ? "Loading…" : null}
        </p>
      </div>

      <div className="dash-cells">
        <Cell label="fees collected" value={`${num(m?.feesSol, 2)} SOL`} sub={solUsd && m ? `≈ ${usd(m.feesSol * solUsd)}` : undefined} />
        <Cell
          label="$KAIRO burned"
          value={num(m?.kairoBurned, 0)}
          sub={burnPct != null ? `${pct(burnPct)} of current supply` : undefined}
        />
        <Cell label="bought back" value={`${num(m?.buybackSol, 2)} SOL`} sub={solUsd && m ? `≈ ${usd(m.buybackSol * solUsd)}` : undefined} />
        <Cell label="miners" value={num(m?.miners)} sub={m ? `${num(m.initCount)} rigs started` : undefined} />
        <Cell label="network hashrate" value={num(m?.totalHashRate)} />
        <Cell
          label="$KAIRO"
          value={kairoUsd != null ? (usd(kairoUsd) ?? "—") : "—"}
          chg={m?.kairoChange24h ?? null}
        />
      </div>

      <div className="dash-charts">
        <ChartPanel title="FEES COLLECTED" total={`${num(m?.feesSol, 1)} SOL`} sub={span} values={series.map((p) => p.feesSol)} />
        <ChartPanel title="$KAIRO BURNED" total={num(m?.kairoBurned, 0)} sub={span} values={series.map((p) => p.kairoBurned)} />
        <ChartPanel title="BUYBACKS" total={`${num(m?.buybackSol, 1)} SOL`} sub={span} values={series.map((p) => p.buybackSol)} />
      </div>

      <p className="dash-foot">
        Hourly buckets, last {hourly.length}h. Cumulative shown as the shaded line. {m ? `Updated ${new Date(m.updatedAt).toLocaleTimeString()}.` : ""}
      </p>
    </main>
  );
}

function Cell({ label, value, sub, chg }: { label: string; value: string; sub?: string; chg?: number | null }) {
  return (
    <div className="hstat">
      <div className="hstat-v">
        {value}
        {chg != null && (
          <span className={`chg ${chg >= 0 ? "up" : "down"}`}>
            {chg >= 0 ? "▲" : "▼"} {Math.abs(chg).toFixed(1)}%
          </span>
        )}
      </div>
      <div className="hstat-l">{label}</div>
      {sub && <div className="hstat-sub">{sub}</div>}
    </div>
  );
}

function ChartPanel({ title, total, sub, values }: { title: string; total: string; sub: string; values: number[] }) {
  return (
    <Window title={title} bodyStyle={{ padding: "16px 16px 12px" }}>
      <div className="chart-head">
        <span className="chart-total">{total}</span>
        <span className="chart-sub">{sub}</span>
      </div>
      <FlowChart values={values} height={190} />
    </Window>
  );
}
