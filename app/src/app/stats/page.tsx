import type { Metadata } from "next";
import { Dashboard } from "@/components/Dashboard";

export const metadata: Metadata = {
  title: "Stats — Kairo protocol",
  description:
    "Live Kairo protocol stats: fees collected, $KAIRO bought back and burned, miners, and network hashrate — straight from on-chain history.",
};

export default function StatsPage() {
  return <Dashboard />;
}
