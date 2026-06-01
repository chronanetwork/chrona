import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "@/components/WalletProvider";
import { Nav, GITHUB_URL, X_URL } from "@/components/Nav";

export const metadata: Metadata = {
  title: "Kairo — rewarding real activity on-chain",
  description:
    "Kairo recognizes and rewards active Solana wallets. Your on-chain history is your mining hash rate — earn $KAIRO via Proof of Activity. Non-custodial and open source.",
  icons: { icon: "/logo.png" },
  openGraph: {
    title: "Kairo — rewarding real activity on-chain",
    description:
      "Your on-chain history is your hash rate. Mine $KAIRO via Proof of Activity. Non-custodial, open source.",
    type: "website",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>
          <Nav />
          {children}
          <footer className="footer">
            <div className="container footer-inner">
              <div className="brand">
                <img src="/logo.png" alt="Kairo" />
                <span>Kairo</span>
              </div>
              <small>Non-custodial · open source · your keys never leave your wallet</small>
              <div className="footer-links">
                <a className="link" href={GITHUB_URL} target="_blank" rel="noreferrer">GitHub</a>
                <a className="link" href={X_URL} target="_blank" rel="noreferrer">X</a>
              </div>
            </div>
          </footer>
        </Providers>
      </body>
    </html>
  );
}
