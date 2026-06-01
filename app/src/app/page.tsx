import Link from "next/link";
import { Mining } from "@/components/Mining";
import { Window } from "@/components/Window";

export default function Home() {
  return (
    <main>
      {/* Hero */}
      <section className="container hero">
        <div className="folio">
          <span className="side">Proof of Activity</span>
          <span className="mid">— Kairo —</span>
          <span className="side">Solana · Devnet Live</span>
        </div>

        <div className="hero-grid">
          <div>
            <span className="eyebrow">Proof of Activity Mining</span>
            <h1>
              Your wallet history is your <em>hashrate</em>.
            </h1>
            <p className="lede">
              Kairo rewards real Solana activity — age, trades, volume, and conviction — without
              GPUs, ASICs, or staking capital.
            </p>
            <div className="hero-cta">
              <Link className="btn" href="#dashboard">Start mining</Link>
              <Link className="btn btn-ghost" href="/calculator">Check wallet score</Link>
            </div>
          </div>

          <div>
            <div className="stamp-lg"><img src="/logo.png" alt="Kairo" /></div>
            <Window title="KAIRO :: SPEC">
              <div className="kv"><span className="k">Supply</span><span className="v">21,000,000</span></div>
              <div className="kv"><span className="k">Emission</span><span className="v">power-law</span></div>
              <div className="kv"><span className="k">Custody</span><span className="v">non-custodial</span></div>
              <div className="kv"><span className="k">Hashrate</span><span className="v">your history</span></div>
              <div className="kv"><span className="k">Network</span><span className="v">devnet · live</span></div>
            </Window>
          </div>
        </div>
      </section>

      {/* How it works + live rig, side by side */}
      <section className="container section" id="how">
        <div className="split">
          <div>
            <div className="section-head left">
              <h2>How it works</h2>
              <p>Connect, let your on-chain history become a hashrate, and mine continuously.</p>
            </div>
            <div style={{ display: "grid", gap: 12 }}>
              <Window tile title={<><span className="accent">01</span> / connect</>}>
                <div className="step">
                  <h3>Connect wallet</h3>
                  <p>
                    Connect any Solana wallet. Kairo reads only your public address and scores you
                    for free — no transaction, no risk.
                  </p>
                </div>
              </Window>
              <Window tile title={<><span className="accent">02</span> / score</>}>
                <div className="step">
                  <h3>Activity becomes hashrate</h3>
                  <p>
                    Your history — wallet age, real trades, volume, and how long you hold — becomes
                    a single hashrate. Open-source and deterministic.
                  </p>
                </div>
              </Window>
              <Window tile title={<><span className="accent">03</span> / mine</>}>
                <div className="step">
                  <h3>Mine $KAIRO</h3>
                  <p>
                    Pay 0.1 SOL to start, then mine continuously by your share of hashrate. It
                    halves every 36h — top off to stay at full. Claim anytime.
                  </p>
                </div>
              </Window>
            </div>
          </div>

          <div id="dashboard">
            <div className="section-head left">
              <h2>Your rig</h2>
              <p>Connect to preview your hashrate, start mining, and claim your $KAIRO.</p>
            </div>
            <Mining />
          </div>
        </div>
      </section>

      {/* Safety */}
      <section className="container section">
        <div className="section-head">
          <span className="eyebrow">Connect with confidence</span>
          <h2>Safe by design, verifiable by anyone</h2>
          <p>Exactly what connecting does — and what it can never do.</p>
        </div>
        <div className="grid-3">
          <Window tile title="non-custodial">
            <div className="step">
              <h3 style={{ fontSize: 21 }}>We never touch funds</h3>
              <p>
                Connecting only reads your public address and lets you sign your own transactions.
                Kairo can never move, spend, or access your assets.
              </p>
            </div>
          </Window>
          <Window tile title="one-signed-tx">
            <div className="step">
              <h3 style={{ fontSize: 21 }}>One transaction</h3>
              <p>
                Mining is a single transaction you review in your wallet — a 0.1 SOL fee to the
                treasury, nothing more. Disconnect anytime.
              </p>
            </div>
          </Window>
          <Window tile title="open + capped">
            <div className="step">
              <h3 style={{ fontSize: 21 }}>Open source &amp; capped</h3>
              <p>
                Program, scorer, and app are all public and auditable. Supply is hard-capped at
                21,000,000 $KAIRO, enforced on-chain.
              </p>
            </div>
          </Window>
        </div>
      </section>
    </main>
  );
}
