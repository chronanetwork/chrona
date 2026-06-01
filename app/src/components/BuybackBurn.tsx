"use client";

import { useEffect, useState } from "react";
import { fetchBuyback, fetchPrices, type BuybackBurnStats, type MarketPrices } from "@/lib/kairo";

const MAX_SUPPLY = 21_000_000;

const num = (n: number, d = 2) =>
  Number.isFinite(n) ? n.toLocaleString(undefined, { maximumFractionDigits: d }) : "—";

const usd = (n: number | null) =>
  n == null || !Number.isFinite(n)
    ? null
    : n < 0.01
      ? `$${n.toPrecision(2)}`
      : `$${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

const day = (ts: number | null) =>
  ts ? new Date(ts * 1000).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : null;

const pct = (n: number) => `${n.toFixed(n > 0 && n < 0.01 ? 4 : 2)}%`;

export function BuybackBurn() {
  const [b, setB] = useState<BuybackBurnStats | null>(null);
  const [p, setP] = useState<MarketPrices | null>(null);

  useEffect(() => {
    let alive = true;
    const load = () => {
      fetchBuyback().then((d) => alive && setB(d)).catch(() => {});
      fetchPrices().then((d) => alive && setP(d)).catch(() => {});
    };
    load();
    const id = setInterval(load, 60_000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  const solValue = b && p?.solUsd != null ? b.solBoughtBack * p.solUsd : null;
  const burnValue = b && p?.kairoUsd != null ? b.kairoBurned * p.kairoUsd : null;
  const burnPctCap = b ? (b.kairoBurned / MAX_SUPPLY) * 100 : null;
  const burnPctSupply = b && b.currentSupply > 0 ? (b.kairoBurned / b.currentSupply) * 100 : null;

  return (
    <div className="bb">
      <div className="bb-cell">
        <div className="bb-v">
          {b ? num(b.solBoughtBack, 3) : "—"} <span className="bb-u">SOL</span>
        </div>
        <div className="bb-l">bought back</div>
        <div className="bb-sub">
          {solValue != null ? `≈ ${usd(solValue)}` : " "}
          {b ? ` · ${b.buybackTxs} ${b.buybackTxs === 1 ? "buy" : "buys"}` : ""}
        </div>
      </div>

      <div className="bb-cell">
        <div className="bb-v">
          {b ? num(b.kairoBurned, 0) : "—"} <span className="bb-u">KAIRO</span>
        </div>
        <div className="bb-l">burned</div>
        <div className="bb-sub">
          {burnPctSupply != null
            ? `${pct(burnPctSupply)} of current supply`
            : burnPctCap != null
              ? `${pct(burnPctCap)} of max supply`
              : " "}
          {burnPctSupply != null && burnPctCap != null ? ` · ${pct(burnPctCap)} of 21M cap` : ""}
          {burnValue != null ? ` · ≈ ${usd(burnValue)}` : ""}
        </div>
      </div>

      <div className="bb-foot">
        {b ? (
          <>
            <span>
              {b.burnTxs} burn{b.burnTxs === 1 ? "" : "s"}
              {day(b.lastBurnTs) ? ` · last ${day(b.lastBurnTs)}` : ""}
            </span>
            <a href={`https://solscan.io/account/${b.devWallet}`} target="_blank" rel="noreferrer">
              dev wallet ↗
            </a>
          </>
        ) : (
          <span>loading on-chain history…</span>
        )}
        {b?.capped && <span className="bb-cap">partial — rescanning</span>}
      </div>
    </div>
  );
}
