import Link from "next/link";
import { Mining } from "@/components/Mining";
import { Window } from "@/components/Window";

export default function Home() {
  return (
    <main>
      {/* Hero — open on the desktop */}
      <section className="container hero">
        <span className="eyebrow">proof of activity</span>
        <h1>
          Mine $KAIRO with your wallet&apos;s <em>history</em>
        </h1>
        <p className="lede">
          Kairo recognizes and rewards the wallets that actually use Solana. Your real on-chain
          history — age, trades, volume, conviction — becomes your mining hash rate. No hardware,
          no lockups. Just real activity, fairly rewarded.
        </p>
        <div className="hero-cta">
          <Link className="btn" href="#dashboard">Start mining</Link>
          <Link className="btn btn-ghost" href="/calculator">Check any wallet</Link>
        </div>
        <div className="trust-line">
          <span>◆ non-custodial</span>
          <span>◆ open source</span>
          <span>◆ one signed transaction</span>
        </div>
      </section>

      {/* How it works — three little windows */}
      <section className="container section" id="how">
        <div className="section-head">
          <h2>Three steps to start earning</h2>
          <p>Connect, get scored from your public on-chain history, and mine continuously.</p>
        </div>
        <div className="grid-3">
          <Window tile title={<><span className="accent">01</span> · get-scored</>}>
            <div className="step">
              <h3>Get scored</h3>
              <p>
                Connect and see your hash rate instantly — a transparent breakdown of wallet age,
                trades, volume, and how long you hold. Open-source and deterministic: anyone can
                recompute your number.
              </p>
            </div>
          </Window>
          <Window tile title={<><span className="accent">02</span> · start-mining</>}>
            <div className="step">
              <h3>Start mining</h3>
              <p>
                Pay a one-time 0.1 SOL initialization and register on-chain. Your wallet then mines
                $KAIRO around the clock, sharing each block in proportion to your hash rate — no
                winner-take-all.
              </p>
            </div>
          </Window>
          <Window tile title={<><span className="accent">03</span> · claim</>}>
            <div className="step">
              <h3>Claim anytime</h3>
              <p>
                Rewards accrue continuously and are yours to claim whenever you like. The program
                mints fresh $KAIRO straight to your wallet — capped at 21,000,000 forever.
              </p>
            </div>
          </Window>
        </div>
      </section>

      {/* Dashboard */}
      <section className="container section" id="dashboard">
        <div className="section-head">
          <h2>Your mining dashboard</h2>
          <p>Connect to preview your hash rate, start mining, and claim your $KAIRO.</p>
        </div>
        <div className="narrow">
          <Mining />
        </div>
      </section>

      {/* Safety */}
      <section className="container section">
        <div className="section-head">
          <span className="eyebrow">connect with confidence</span>
          <h2>Built to be safe — and verifiable</h2>
          <p>
            You never have to take our word for anything. Here&apos;s exactly what connecting does,
            and what it can&apos;t do.
          </p>
        </div>
        <div className="grid-3">
          <Window tile title="never-touch-funds.txt">
            <div className="step">
              <h3 style={{ fontSize: 18 }}>We never touch your funds</h3>
              <p>
                Fully non-custodial. Connecting only lets us read your public address and lets you
                sign your own transactions. We can never move, spend, or access your assets.
              </p>
            </div>
          </Window>
          <Window tile title="one-transaction.txt">
            <div className="step">
              <h3 style={{ fontSize: 18 }}>One transaction, in your control</h3>
              <p>
                Mining is a single transaction you review and approve in your own wallet — a 0.1 SOL
                fee to the treasury, nothing more. Disconnect anytime.
              </p>
            </div>
          </Window>
          <Window tile title="open-and-capped.txt">
            <div className="step">
              <h3 style={{ fontSize: 18 }}>Open source &amp; capped</h3>
              <p>
                Every line — program, scorer, and this app — is public and auditable. Supply is
                hard-capped at 21,000,000 $KAIRO, enforced on-chain. Nothing hidden.
              </p>
            </div>
          </Window>
        </div>
      </section>
    </main>
  );
}
