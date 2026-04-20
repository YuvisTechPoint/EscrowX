"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, ExternalLink, RefreshCcw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import EscrowDetailsDialog from "@/components/EscrowDetailsDialog";
import EthAmountWithUsd from "@/components/EthAmountWithUsd";
import { getEscrow } from "@/lib/contract";
import type { Escrow } from "@/types";

export default function EscrowDetailsPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [escrow, setEscrow] = useState<Escrow | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [open, setOpen] = useState(true);

  const escrowId = useMemo(() => {
    const raw = params?.id ?? "";
    const normalized = Array.isArray(raw) ? raw[0] : raw;
    if (!normalized) return null;
    try {
      const asBig = BigInt(normalized);
      if (asBig <= 0n) return null;
      return asBig;
    } catch {
      return null;
    }
  }, [params]);

  const load = async () => {
    if (!escrowId) return;
    try {
      setIsLoading(true);
      const data = await getEscrow(escrowId);
      setEscrow(data);
    } catch (e) {
      console.error("getEscrow error:", e);
      toast.error("Failed to load escrow. Check ID and contract configuration.");
      setEscrow(null);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [escrowId?.toString()]);

  if (!escrowId) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Invalid escrow ID</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>The URL must be like: <span className="font-mono">/escrow/1</span></p>
          <Button variant="outline" onClick={() => router.push("/dashboard")}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to dashboard
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col items-start justify-between gap-2 md:flex-row md:items-center">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold">Escrow #{escrowId.toString()}</h1>
          {escrow ? (
            <p className="text-sm text-muted-foreground">
              Amount: <EthAmountWithUsd wei={escrow.amount} />
            </p>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => router.push("/dashboard")}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Dashboard
          </Button>
          <Button variant="outline" onClick={() => void load()} disabled={isLoading}>
            <RefreshCcw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
          {escrow ? (
            <Button asChild variant="secondary">
              <a
                href={`https://sepolia.etherscan.io/address/${process.env.NEXT_PUBLIC_CONTRACT_ADDRESS}`}
                target="_blank"
                rel="noreferrer"
              >
                Contract <ExternalLink className="ml-2 h-4 w-4" />
              </a>
            </Button>
          ) : null}
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Escrow timeline</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            This page uses the same timeline view as the dashboard details modal.
          </CardContent>
        </Card>
      )}

      <EscrowDetailsDialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) router.push("/dashboard");
        }}
        escrow={escrow}
      />
    </div>
  );
}

