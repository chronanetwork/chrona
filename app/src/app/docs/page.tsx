import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Docs — how Kairo works",
  description:
    "How Kairo turns your Solana history into a mining hashrate: scoring, emission, mining, the token, and why it's safe to connect.",
};

export default function DocsPage() {
  return (
    <main className="container" style={{ paddingTop: 36 }}>
      <div className="section-head" style={{ marginBottom: 18 }}>
        <span className="eyebrow">Docs</span>
        <h2 style={{ fontSize: "clamp(34px,5vw,52px)" }}>How Kairo works</h2>
        <p>
          The whole thing, start to finish — what your score means, how mining works, what the
          token is, and why connecting your wallet is safe. No fluff.
        </p>
      </div>

      <div className="docs-grid">
        <nav className="toc">
          <div className="toc-label">On this page</div>
          <a href="#what">What Kairo is</a>
          <a href="#score">Your score</a>
          <a href="#emission">The emission curve</a>
          <a href="#mining">How mining works</a>
          <a href="#token">The $KAIRO token</a>
          <a href="#safe">Is it safe?</a>
          <a href="#faq">FAQ</a>
        </nav>

        <div>
          <section className="doc-section" id="what">
            <span className="kicker">01 — overview</span>
            <h2>What Kairo is</h2>
            <div className="prose">
              <p>
                Most tokens reward whoever turns up with the most money. Kairo doesn&apos;t. It
                rewards the wallets that have actually <strong>used</strong> Solana — the ones with
                real history, real trades, real conviction.
              </p>
              <p>
                When you connect, Kairo reads your public on-chain history and turns it into a single
                number: your <strong>hashrate</strong>. The higher it is, the faster you mine $KAIRO.
                No GPUs, no ASICs, no staking your capital — your past activity is the rig.
              </p>
              <p className="small">
                It&apos;s &ldquo;proof of activity&rdquo;: you&apos;re not racing to win a block,
                you&apos;re sharing every block with everyone else, in proportion to your hashrate.
              </p>
            </div>
          </section>

          <section className="doc-section" id="score">
            <span className="kicker">02 — scoring</span>
            <h2>Your score</h2>
            <div className="prose">
              <p>
                Your score is built from four things about your wallet, all read straight from the
                chain:
              </p>
              <ul>
                <li>Age — how long your wallet has been around</li>
                <li>Trades — how many real swaps you&apos;ve made (dust under $10 doesn&apos;t count)</li>
                <li>Volume — the USD size of those swaps</li>
                <li>Hold time — how long you actually hold what you buy</li>
              </ul>
              <p>
                Each one is capped and weighted, then mapped onto a hashrate between <strong>100</strong>{" "}
                and <strong>10,000</strong>. A brand-new wallet still scores something; a long-lived,
                high-conviction trader lands near the top. The cap matters — it stops whales from
                running away with the whole pool.
              </p>
              <p>
                A few deliberate choices keep it honest: trade count and volume scale logarithmically
                (so wash-trading hits a wall fast), only tokens you actually <strong>bought</strong>{" "}
                count toward hold time (airdrops don&apos;t), and we use the median hold, not the
                average, so one diamond-hand bag can&apos;t carry you.
              </p>
              <p className="small">
                The scoring is open-source and deterministic — same wallet, same inputs, same number,
                every time. Anyone can recompute yours and check it. Try it on the{" "}
                <Link href="/calculator">calculator</Link>.
              </p>
            </div>
          </section>

          <section className="doc-section" id="emission">
            <span className="kicker">03 — emission</span>
            <h2>The emission curve</h2>
            <div className="prose">
              <p>
                $KAIRO is front-loaded: it pays out fast at the start and then settles into a long,
                steady drip. Day one mints <strong>30,000 $KAIRO</strong> to the whole network;
                that drops quickly to around <strong>5,000 a day by day ten</strong> and then holds
                in that neighborhood for years, easing down slowly.
              </p>
              <ul>
                <li>Day 1 — ~30,000 / day</li>
                <li>Day 10 — ~5,000 / day</li>
                <li>Year 1 — ~4,500 / day</li>
                <li>Year 10 — ~2,000 / day</li>
              </ul>
              <p>
                It&apos;s the sum of two halving curves — a sharp early &ldquo;spike&rdquo; plus a
                slow &ldquo;base&rdquo; — which together approach but never quite reach the{" "}
                <strong>21,000,000</strong> ceiling. Earliest miners earn the most, but there&apos;s
                still meaningful $KAIRO left to mine for a very long time.
              </p>
              <p className="small">
                Whatever the network emits in a given moment is split across all active miners by
                hashrate share. More miners (or a bigger network hashrate) means a thinner slice each.
              </p>
            </div>
          </section>

          <section className="doc-section" id="mining">
            <span className="kicker">04 — mining</span>
            <h2>How mining works</h2>
            <div className="prose">
              <p>
                Once you&apos;re in, you mine continuously — nothing to keep open, no process to
                run. The program tracks everyone&apos;s hashrate and credits your share every
                moment, using the same accumulator pattern staking contracts use (so it costs the
                same whether there are 10 miners or 10,000).
              </p>
              <p>
                But mining isn&apos;t set-and-forget. Your hashrate <strong>halves every 36 hours</strong> —
                so to keep earning at full power you <strong>top off</strong> (a small 0.02 SOL fee)
                to reset it to your full score. Let it slide and you simply mine less; top off and
                you&apos;re back to 100%. It keeps Kairo for people who actually stick around, and
                lets abandoned wallets fade out instead of diluting everyone forever.
              </p>
              <p>
                Your rewards pile up on-chain until you <strong>claim</strong> — mints the $KAIRO
                straight to your wallet, whenever you like. Accrued rewards never expire; only your
                hashrate decays.
              </p>
              <p className="small">
                Costs: a one-time <strong>0.1 SOL</strong> entry fee, then <strong>0.02 SOL</strong>
                per top-off to stay at full hashrate. Anyone can also &ldquo;poke&rdquo; a dormant
                miner to apply its decay — that&apos;s how ghosts get pruned from the pool.
              </p>
            </div>
          </section>

          <section className="doc-section" id="token">
            <span className="kicker">05 — token</span>
            <h2>The $KAIRO token</h2>
            <div className="prose">
              <ul>
                <li>Standard SPL token, 6 decimals</li>
                <li>Hard cap — 21,000,000, enforced on-chain</li>
                <li>100,000 at genesis (the launch supply); everything else is mined</li>
                <li>Mint authority is held by the program — no one can mint outside the rules</li>
              </ul>
              <p>
                The launch supply seeds a Dynamic Bonding Curve so $KAIRO is tradeable from day one.
                After that, the only new $KAIRO that can ever exist is what gets mined — and that&apos;s
                bounded by the curve above and capped forever at 21M.
              </p>
            </div>
          </section>

          <section className="doc-section" id="safe">
            <span className="kicker">06 — safety</span>
            <h2>Is it safe to connect?</h2>
            <div className="prose">
              <p>
                Short version: connecting can&apos;t lose you anything. Kairo is fully
                non-custodial. Connecting only lets the site read your public address and ask you to
                sign transactions you can see and reject. We can never move, spend, or touch your
                assets.
              </p>
              <p>
                Mining is a single transaction you approve in your own wallet — the 0.1 SOL fee and
                nothing else. The program mints rewards through its own authority based on the math;
                that minting can&apos;t be triggered to exceed the cap or sent anywhere but the
                claimer.
              </p>
              <p>
                Your score is signed off-chain and verified on-chain, so you can&apos;t fake a higher
                number — and even if our signing key were ever compromised, the worst case is a wrong
                hashrate (bounded by the cap), never stolen funds or extra supply.
              </p>
              <p className="small">
                Everything — the program, the scorer, and this site — is open source. Read it, run
                it, check it: <a href="https://github.com/KairoMine/kairo" target="_blank" rel="noreferrer">github.com/KairoMine/kairo</a>.
              </p>
            </div>
          </section>

          <section className="doc-section" id="faq">
            <span className="kicker">07 — faq</span>
            <h2>FAQ</h2>
            <div className="prose">
              <p className="lead-q">Do I have to keep my computer on to mine?</p>
              <p>No. Once you&apos;ve initialized, you mine 24/7 on-chain. Close the tab — your rewards keep accruing.</p>

              <p className="lead-q">Why is my score lower than I expected?</p>
              <p>
                Usually hold time. If you trade fast and flip quickly, that factor stays low by
                design — Kairo rewards conviction. Trades and volume also flatten out past their caps,
                so being extremely active doesn&apos;t push the number much higher.
              </p>

              <p className="lead-q">Does my hashrate really halve every 36 hours?</p>
              <p>
                Yes — your effective hashrate halves every 36h until you top off (0.02 SOL), which
                resets it to your full score. Your base score itself doesn&apos;t change; only the
                effective rate decays. It&apos;s what keeps mining tied to staying active.
              </p>

              <p className="lead-q">What does it cost to mine?</p>
              <p>
                A one-time <strong>0.1 SOL</strong> to start (anti-spam), then <strong>0.02 SOL</strong>
                per top-off whenever you want to restore full hashrate. Skip top-offs and you just
                earn less — you&apos;re never forced to pay.
              </p>

              <p className="lead-q">Is this live on mainnet?</p>
              <p>
                It&apos;s running on devnet today while we finish testing. Scores are always computed
                from real <strong>mainnet</strong> history, so the number you see is the real one.
              </p>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
