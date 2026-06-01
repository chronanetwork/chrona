"use client";

/**
 * Lightweight SVG flow chart: per-bucket bars with a cumulative area behind,
 * in the brand palette. No chart library — sharp, on-theme, tiny.
 */
export function FlowChart({
  values,
  accent = "var(--accent)",
  height = 200,
}: {
  values: number[];
  accent?: string;
  height?: number;
}) {
  const n = values.length;
  const VBW = 1000;
  const VBH = 320;
  const padL = 6;
  const padR = 6;
  const padT = 14;
  const padB = 10;
  const plotW = VBW - padL - padR;
  const plotH = VBH - padT - padB;

  const max = Math.max(1e-9, ...values);
  const cum: number[] = [];
  values.reduce((a, v, i) => (cum[i] = a + v), 0);
  const total = Math.max(1e-9, cum[n - 1] ?? 0);

  const bw = plotW / Math.max(1, n);
  const barW = Math.max(1.5, bw * 0.6);
  const cx = (i: number) => padL + i * bw + bw / 2;
  const yBar = (v: number) => padT + plotH - (v / max) * plotH;
  const yCum = (v: number) => padT + plotH - (v / total) * plotH;

  const cumLine = cum.map((v, i) => `${cx(i).toFixed(1)},${yCum(v).toFixed(1)}`).join(" ");
  const areaPath =
    `M ${padL},${padT + plotH} ` +
    `L ${cum.map((v, i) => `${cx(i).toFixed(1)},${yCum(v).toFixed(1)}`).join(" L ")} ` +
    `L ${padL + plotW},${padT + plotH} Z`;

  return (
    <svg viewBox={`0 0 ${VBW} ${VBH}`} preserveAspectRatio="none" style={{ width: "100%", height, display: "block" }}>
      {[0.25, 0.5, 0.75, 1].map((f) => {
        const y = padT + plotH * (1 - f);
        return (
          <line
            key={f}
            x1={padL}
            x2={padL + plotW}
            y1={y}
            y2={y}
            stroke="var(--line-2)"
            strokeWidth={1}
            strokeDasharray="2 5"
            vectorEffect="non-scaling-stroke"
            opacity={0.5}
          />
        );
      })}

      {/* cumulative area + line */}
      <path d={areaPath} fill={accent} opacity={0.1} />
      <polyline
        points={cumLine}
        fill="none"
        stroke={accent}
        strokeWidth={2}
        strokeOpacity={0.55}
        vectorEffect="non-scaling-stroke"
      />

      {/* per-bucket bars */}
      {values.map((v, i) =>
        v > 0 ? (
          <rect key={i} x={cx(i) - barW / 2} y={yBar(v)} width={barW} height={padT + plotH - yBar(v)} fill={accent} />
        ) : null,
      )}

      <line
        x1={padL}
        x2={padL + plotW}
        y1={padT + plotH}
        y2={padT + plotH}
        stroke="var(--line)"
        strokeWidth={1.5}
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
