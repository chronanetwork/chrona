"use client";

import { useEffect, useState } from "react";
import { useConnection } from "@solana/wallet-adapter-react";
import {
  fetchNetworkStats,
  fetchPrices,
  getReadonlyProgram,
  type MarketPrices,
  type NetworkStats,
} from "@/lib/kairo";

const fmt = (n: number, d = 0) =>
  Number.isFinite(n) ? n.toLocaleString(undefined, { maximumFractionDigits: d }) : "—";

const fmtPrice = (p: number) => (p < 0.01 ? `$${p.toPrecision(2)}` : `$${p.toFixed(4)}`);

export function Stats() {
  const { connection } = useConnection();
  const [s, setS] = useState<NetworkStats | null>(null);
  const [p, setP] = useState<MarketPrices | null>(null);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const program = getReadonlyProgram(connection);
        const [ns, pr] = await Promise.all([
          fetchNetworkStats(program).catch(() => null),
          fetchPrices().catch(() => null),
        ]);
        if (!alive) return;
        if (ns) setS(ns);
        if (pr) setP(pr);
      } catch {
        /* ignore */
      }
    };
    load();
    const id = setInterval(load, 60_000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [connection]);

  const price = p?.kairoUsd ?? null;
  const chg = p?.kairoChange24h ?? null;

  return (
    <div className="hero-stats">
      <Cell
        label="$KAIRO"
        value={price != null ? fmtPrice(price) : "—"}
        chg={chg}
      />
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
