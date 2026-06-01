"use client";

import { useEffect, useState } from "react";
import { fetchStats, type LiveStats } from "@/lib/kairo";

const fmt = (n: number, d = 0) =>
  Number.isFinite(n) ? n.toLocaleString(undefined, { maximumFractionDigits: d }) : "—";

const fmtPrice = (p: number) => (p < 0.01 ? `$${p.toPrecision(2)}` : `$${p.toFixed(4)}`);

export function Stats() {
  const [s, setS] = useState<LiveStats | null>(null);

  useEffect(() => {
    let alive = true;
    const load = () => fetchStats().then((d) => alive && setS(d)).catch(() => {});
    load();
    const id = setInterval(load, 60_000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  const price = s?.kairoUsd ?? null;
  const chg = s?.kairoChange24h ?? null;

  return (
    <div className="hero-stats">
      <Cell label="$KAIRO" value={price != null ? fmtPrice(price) : "—"} chg={chg} />
      <Cell label="network hashrate" value={s ? fmt(s.totalHashRate) : "—"} />
      <Cell label="miners" value={s ? fmt(s.miners) : "—"} />
      <Cell label="mined" value={s ? `${fmt(s.minedKairo)} / 20M` : "—"} />
    </div>
  );
}

function Cell({ label, value, chg }: { label: string; value: string; chg?: number | null }) {
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
    </div>
  );
}
