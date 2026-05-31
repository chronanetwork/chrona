"use client";

import { Buffer } from "buffer";
import { useMemo } from "react";
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { RPC_URL } from "@/lib/kairo";
import "@solana/wallet-adapter-react-ui/styles.css";

// Browser polyfill for Buffer (used by web3.js / anchor).
if (typeof window !== "undefined") {
  (window as any).Buffer = (window as any).Buffer ?? Buffer;
}

export function Providers({ children }: { children: React.ReactNode }) {
  // Phantom, Solflare, etc. are auto-detected via the Wallet Standard — no need
  // to bundle individual adapters.
  const wallets = useMemo(() => [], []);

  return (
    <ConnectionProvider endpoint={RPC_URL}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>{children}</WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
