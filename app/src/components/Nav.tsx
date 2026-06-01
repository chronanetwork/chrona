"use client";

import Link from "next/link";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";

export const GITHUB_URL = "https://github.com/KairoMine/kairo";
export const X_URL = "https://x.com/MineKairo";

function XIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231 5.45-6.231Zm-1.161 17.52h1.833L7.084 4.126H5.117L17.083 19.77Z" />
    </svg>
  );
}

function GitHubIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 .5C5.37.5 0 5.78 0 12.29c0 5.21 3.44 9.63 8.21 11.19.6.11.82-.25.82-.57v-2c-3.34.71-4.04-1.59-4.04-1.59-.55-1.37-1.34-1.74-1.34-1.74-1.09-.73.08-.72.08-.72 1.2.08 1.84 1.21 1.84 1.21 1.07 1.8 2.81 1.28 3.5.98.11-.76.42-1.28.76-1.58-2.67-.3-5.47-1.31-5.47-5.83 0-1.29.47-2.34 1.23-3.17-.12-.3-.53-1.52.12-3.16 0 0 1-.31 3.3 1.21a11.5 11.5 0 0 1 6 0c2.28-1.52 3.29-1.21 3.29-1.21.65 1.64.24 2.86.12 3.16.77.83 1.23 1.88 1.23 3.17 0 4.53-2.81 5.52-5.49 5.81.43.36.81 1.09.81 2.2v3.26c0 .32.21.69.83.57C20.56 21.91 24 17.5 24 12.29 24 5.78 18.63.5 12 .5Z" />
    </svg>
  );
}

export function Nav() {
  return (
    <nav className="nav">
      <div className="nav-inner">
        <Link href="/" className="brand">
          <img src="/logo.png" alt="Kairo" />
          <span>Kairo</span>
        </Link>
        <div className="nav-links">
          <Link className="link" href="/#how">How it works</Link>
          <Link className="link" href="/calculator">Calculator</Link>
          <a className="icon-btn" href={X_URL} target="_blank" rel="noreferrer" aria-label="Kairo on X">
            <XIcon />
          </a>
          <a className="icon-btn" href={GITHUB_URL} target="_blank" rel="noreferrer" aria-label="Kairo on GitHub">
            <GitHubIcon />
          </a>
          <WalletMultiButton />
        </div>
      </div>
    </nav>
  );
}
