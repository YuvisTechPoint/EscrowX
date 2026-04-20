"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CheckCircle2, AlertTriangle, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { getEnvStatus } from "@/lib/env";
import { getPublicProvider } from "@/lib/web3";

type RpcState = "unknown" | "ok" | "error";

export default function EnvironmentStatus() {
  const env = useMemo(() => getEnvStatus(), []);
  const [rpcState, setRpcState] = useState<RpcState>("unknown");

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        const provider = getPublicProvider();
        await provider.getBlockNumber();
        if (!cancelled) setRpcState("ok");
      } catch {
        if (!cancelled) setRpcState("error");
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, []);

  const contractBadge = env.contractAddressValid ? (
    <Badge className="bg-green-600 text-white">Contract configured</Badge>
  ) : (
    <Badge className="bg-red-600 text-white">Contract missing/invalid</Badge>
  );

  const rpcBadge =
    rpcState === "ok" ? (
      <Badge className="bg-green-600 text-white">RPC ok</Badge>
    ) : rpcState === "error" ? (
      <Badge className="bg-red-600 text-white">RPC error</Badge>
    ) : (
      <Badge variant="secondary">RPC checking…</Badge>
    );

  if (env.contractAddressValid && rpcState === "ok") return null;

  return (
    <div className="mx-auto mb-4 flex max-w-7xl flex-col gap-2 rounded-xl border border-yellow-500/40 bg-yellow-500/10 px-4 py-3 text-sm md:flex-row md:items-center md:justify-between">
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 h-4 w-4" />
        <div className="space-y-1">
          <div className="font-semibold">Configuration check</div>
          <div className="text-muted-foreground">
            Some features may not work until your contract address and RPC are configured.
          </div>
          <div className="flex flex-wrap gap-2 pt-1">
            {contractBadge}
            {rpcBadge}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {env.contractAddress ? (
          <Link
            className="inline-flex items-center gap-2 rounded-md border bg-background px-3 py-1 text-xs hover:bg-muted"
            href={`https://sepolia.etherscan.io/address/${env.contractAddress}`}
            target="_blank"
            title="Open contract on Etherscan"
          >
            <CheckCircle2 className="h-4 w-4 text-green-600" />
            View contract
            <ExternalLink className="h-3.5 w-3.5" />
          </Link>
        ) : null}
        <Button asChild variant="outline" size="sm">
          <Link href="/#setup">Setup help</Link>
        </Button>
      </div>
    </div>
  );
}

