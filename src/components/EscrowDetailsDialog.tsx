"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ethers } from "ethers";
import { Copy, ExternalLink, History, Link2, RotateCcw, ShieldCheck, ShieldX } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import EthAmountWithUsd from "@/components/EthAmountWithUsd";
import { getEscrowActivitiesForEscrow } from "@/lib/contract";
import { truncateAddress } from "@/lib/web3";
import { EscrowStatus, type Escrow, type EscrowActivity } from "@/types";

function statusBadge(status: EscrowStatus) {
  if (status === EscrowStatus.PENDING) return <Badge className="bg-yellow-500 text-black">PENDING</Badge>;
  if (status === EscrowStatus.COMPLETED) return <Badge className="bg-green-600 text-white">COMPLETED</Badge>;
  return <Badge className="bg-red-600 text-white">REFUNDED</Badge>;
}

function activityIcon(type: EscrowActivity["type"]) {
  if (type === "CREATED") return <History className="h-4 w-4" />;
  if (type === "RELEASED") return <ShieldCheck className="h-4 w-4 text-green-600" />;
  return <ShieldX className="h-4 w-4 text-red-600" />;
}

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  escrow: Escrow | null;
};

export default function EscrowDetailsDialog({ open, onOpenChange, escrow }: Props) {
  const [isLoading, setIsLoading] = useState(false);
  const [timeline, setTimeline] = useState<EscrowActivity[]>([]);

  const title = useMemo(() => (escrow ? `Escrow #${escrow.id.toString()}` : "Escrow"), [escrow]);

  const loadTimeline = async () => {
    if (!escrow) return;
    try {
      setIsLoading(true);
      const data = await getEscrowActivitiesForEscrow(escrow.id, 50);
      setTimeline(data);
    } catch (error) {
      console.error("loadTimeline error:", error);
      toast.error("Failed to load escrow timeline.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!open || !escrow) return;
    void loadTimeline();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, escrow?.id?.toString()]);

  const copyToClipboard = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`${label} copied.`);
    } catch {
      toast.error(`Failed to copy ${label.toLowerCase()}.`);
    }
  };

  const copyShareLink = async () => {
    if (!escrow) return;
    const url = `${window.location.origin}/escrow/${escrow.id.toString()}`;
    await copyToClipboard(url, "Share link");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between gap-3">
            <span className="truncate">{title}</span>
            {escrow ? statusBadge(escrow.status) : null}
          </DialogTitle>
          <DialogDescription>Full on-chain timeline and details for this escrow.</DialogDescription>
        </DialogHeader>

        {!escrow ? (
          <div className="text-sm text-muted-foreground">No escrow selected.</div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-3 rounded-lg border p-4">
              <div className="text-sm font-semibold">Parties</div>
              <div className="space-y-2 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-muted-foreground">Buyer</span>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{truncateAddress(escrow.buyer)}</span>
                    <button
                      type="button"
                      className="text-muted-foreground hover:text-foreground"
                      onClick={() => void copyToClipboard(escrow.buyer, "Buyer address")}
                      title="Copy buyer address"
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </button>
                    <Link
                      href={`https://sepolia.etherscan.io/address/${escrow.buyer}`}
                      target="_blank"
                      className="text-muted-foreground hover:text-foreground"
                      title="Open buyer on Etherscan"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </Link>
                  </div>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-muted-foreground">Seller</span>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{truncateAddress(escrow.seller)}</span>
                    <button
                      type="button"
                      className="text-muted-foreground hover:text-foreground"
                      onClick={() => void copyToClipboard(escrow.seller, "Seller address")}
                      title="Copy seller address"
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </button>
                    <Link
                      href={`https://sepolia.etherscan.io/address/${escrow.seller}`}
                      target="_blank"
                      className="text-muted-foreground hover:text-foreground"
                      title="Open seller on Etherscan"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </Link>
                  </div>
                </div>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-md bg-muted/40 p-3">
                  <div className="text-xs text-muted-foreground">Amount</div>
                  <div className="mt-1 text-base font-semibold">
                    <EthAmountWithUsd wei={escrow.amount} />
                  </div>
                </div>
                <div className="rounded-md bg-muted/40 p-3">
                  <div className="text-xs text-muted-foreground">Created</div>
                  <div className="mt-1 text-base font-semibold">
                    {new Date(Number(escrow.createdAt) * 1000).toLocaleString()}
                  </div>
                </div>
              </div>

              <div className="pt-2 text-sm">
                <div className="text-xs text-muted-foreground">Description</div>
                <div className="mt-1 break-words">{escrow.description}</div>
              </div>

              <div className="pt-2">
                <Button variant="outline" className="w-full" onClick={() => void copyShareLink()}>
                  <Link2 className="mr-2 h-4 w-4" />
                  Copy share link
                </Button>
              </div>
            </div>

            <div className="space-y-3 rounded-lg border p-4">
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm font-semibold">Timeline</div>
                <Button variant="outline" size="sm" onClick={() => void loadTimeline()} disabled={isLoading}>
                  <RotateCcw className="mr-2 h-4 w-4" />
                  Refresh
                </Button>
              </div>

              {isLoading ? (
                <div className="space-y-2">
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                </div>
              ) : timeline.length === 0 ? (
                <div className="text-sm text-muted-foreground">No events found for this escrow yet.</div>
              ) : (
                <div className="max-h-[45vh] space-y-2 overflow-auto pr-1">
                  {timeline.map((a) => (
                    <div key={`${a.txHash}-${a.type}`} className="rounded-md border p-3 text-sm">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 font-semibold">
                            {activityIcon(a.type)}
                            <span>
                              {a.type === "CREATED"
                                ? "Escrow created"
                                : a.type === "RELEASED"
                                  ? "Payment released"
                                  : "Escrow refunded"}
                            </span>
                          </div>
                          <div className="mt-1 text-xs text-muted-foreground">
                            {new Date(a.timestamp * 1000).toLocaleString()}
                          </div>
                          <div className="mt-2 text-xs text-muted-foreground">
                            Amount:{" "}
                            <span className="font-medium text-foreground">
                              <EthAmountWithUsd wei={a.amount} />
                            </span>
                          </div>
                        </div>

                        <div className="flex flex-col items-end gap-2">
                          <Link
                            className="text-xs underline hover:text-foreground"
                            href={`https://sepolia.etherscan.io/tx/${a.txHash}`}
                            target="_blank"
                          >
                            View tx
                          </Link>
                          <button
                            type="button"
                            className="text-xs text-muted-foreground underline hover:text-foreground"
                            onClick={() => void copyToClipboard(a.txHash, "Transaction hash")}
                          >
                            Copy hash
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

