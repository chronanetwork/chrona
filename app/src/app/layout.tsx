import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "@/components/WalletProvider";

export const metadata: Metadata = {
  title: "Kairo — mine with your wallet's history",
  description:
    "Kairo rewards active Solana wallets. Your on-chain history is your hash rate. Mine $KAIRO via Proof of Activity.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
