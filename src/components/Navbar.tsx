"use client";

import Link from "next/link";
import WalletConnect from "@/components/WalletConnect";
import NotificationsBell from "@/components/NotificationsBell";
import ThemeToggle from "@/components/ThemeToggle";
import PriceTicker from "@/components/PriceTicker";

export default function Navbar() {
  return (
    <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur-sm">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-3">
        <Link href="/" className="text-xl font-bold tracking-tight text-primary">
          EscrowX
        </Link>

        <nav className="flex gap-4 text-sm md:text-base">
          <Link className="hover:text-primary" href="/">
            Home
          </Link>
          <Link className="hover:text-primary" href="/create">
            Create Escrow
          </Link>
          <Link className="hover:text-primary" href="/dashboard">
            Dashboard
          </Link>
        </nav>

        <div className="flex items-center gap-2">
          <PriceTicker />
          <ThemeToggle />
          <NotificationsBell />
          <WalletConnect />
        </div>
      </div>
    </header>
  );
}
