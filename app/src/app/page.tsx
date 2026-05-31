import { Mining } from "@/components/Mining";

export default function Home() {
  return (
    <main className="container">
      <div className="brand">
        <h1>Kairo</h1>
        <span style={{ color: "var(--muted)", fontSize: 13 }}>devnet</span>
      </div>
      <p className="tag">
        Proof of Activity. Your wallet&apos;s on-chain history is your hash rate —
        mine $KAIRO just by having been active on Solana.
      </p>
      <Mining />
      <p style={{ textAlign: "center" }}>
        <a className="navlink" href="/calculator">
          Check any wallet&apos;s score &amp; earnings →
        </a>
      </p>
      <p className="msg" style={{ textAlign: "center", marginTop: 12 }}>
        <a href="https://github.com/KairoMine/kairo" target="_blank" rel="noreferrer">
          open source on GitHub
        </a>
      </p>
    </main>
  );
}
