"use client";

import Link from "next/link";
import { ShieldCheck, Wallet, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useWeb3 } from "@/context/Web3Context";
import { truncateAddress } from "@/lib/web3";

export default function HomePage() {
  const { address, balance, connect, isConnecting } = useWeb3();

  return (
    <div className="space-y-10">
      <section id="setup" className="grid gap-8 rounded-2xl border bg-background/70 p-8 shadow-xl backdrop-blur md:grid-cols-2">
        <div className="space-y-5 animate-fade-in">
          <h1 className="text-4xl font-bold leading-tight md:text-5xl">
            Trustless Escrow for <span className="text-primary">Real ETH Deals</span>
          </h1>
          <p className="text-muted-foreground">
            EscrowX locks buyer funds in smart contracts until delivery is complete. Release or refund is managed transparently on Sepolia.
          </p>

          <div className="flex flex-wrap gap-3">
            {!address ? (
              <Button size="lg" onClick={() => void connect()} disabled={isConnecting}>
                <Wallet className="mr-2 h-4 w-4" />
                {isConnecting ? "Connecting..." : "Connect Wallet"}
              </Button>
            ) : (
              <div className="rounded-lg border bg-card px-4 py-3 text-sm">
                {truncateAddress(address)} | {balance} Sepolia ETH
              </div>
            )}

            <Button asChild size="lg" variant="outline">
              <Link href="/create">
                Create Escrow <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="secondary">
              <Link href="/dashboard">Go to Dashboard</Link>
            </Button>
          </div>
        </div>

        <Card className="overflow-hidden border-primary/20 bg-gradient-to-br from-blue-50 to-sky-100 dark:from-slate-900 dark:to-blue-950">
          <CardContent className="space-y-5 p-6">
            <div className="flex items-center gap-3 text-lg font-semibold">
              <ShieldCheck className="text-primary" />
              How Escrow Works
            </div>
            <ol className="list-decimal space-y-2 pl-5 text-sm">
              <li>Buyer creates escrow and deposits ETH.</li>
              <li>Seller delivers goods/services off-chain.</li>
              <li>Buyer releases payment or refunds before release.</li>
              <li>All actions are verifiable on Sepolia Etherscan.</li>
            </ol>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
