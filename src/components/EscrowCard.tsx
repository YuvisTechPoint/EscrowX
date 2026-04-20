"use client";

import { Copy, ExternalLink, Star } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import DeadlineTimer from "@/components/DeadlineTimer";
import EthAmountWithUsd from "@/components/EthAmountWithUsd";
import { truncateAddress } from "@/lib/web3";
import { EscrowStatus, type Escrow } from "@/types";

type Props = {
  escrow: Escrow;
  currentAddress: string | null;
  isWatched: boolean;
  onCopyAddress: (value: string, label: string) => void;
  onRelease: (id: bigint) => void;
  onRefund: (id: bigint) => void;
  onToggleWatch: (id: bigint) => void;
  onOpenDetails?: (escrow: Escrow) => void;
};

function statusBadge(status: EscrowStatus) {
  if (status === EscrowStatus.PENDING) return <Badge className="bg-yellow-500 text-black">PENDING</Badge>;
  if (status === EscrowStatus.COMPLETED) return <Badge className="bg-green-600 text-white">COMPLETED</Badge>;
  return <Badge className="bg-red-600 text-white">REFUNDED</Badge>;
}

export default function EscrowCard({
  escrow,
  currentAddress,
  isWatched,
  onCopyAddress,
  onRelease,
  onRefund,
  onToggleWatch,
  onOpenDetails,
}: Props) {
  const isBuyer = currentAddress?.toLowerCase() === escrow.buyer.toLowerCase();
  const canAct = isBuyer && escrow.status === EscrowStatus.PENDING;

  return (
    <Card className="animate-fade-in" id={`escrow-${escrow.id.toString()}`}>
      <CardHeader>
        <CardTitle className="flex items-center justify-between text-lg">
          Escrow #{escrow.id.toString()}
          {statusBadge(escrow.status)}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {escrow.deadline && escrow.deadline > 0n ? (
          <div className="flex justify-end">
            <DeadlineTimer deadline={escrow.deadline} />
          </div>
        ) : null}
        <p className="flex items-center gap-2">
          <strong>Buyer:</strong> {truncateAddress(escrow.buyer)}
          <button
            type="button"
            className="text-muted-foreground hover:text-foreground"
            onClick={() => onCopyAddress(escrow.buyer, "Buyer address")}
            title="Copy buyer address"
          >
            <Copy className="h-3.5 w-3.5" />
          </button>
        </p>
        <p className="flex items-center gap-2">
          <strong>Seller:</strong> {truncateAddress(escrow.seller)}
          <button
            type="button"
            className="text-muted-foreground hover:text-foreground"
            onClick={() => onCopyAddress(escrow.seller, "Seller address")}
            title="Copy seller address"
          >
            <Copy className="h-3.5 w-3.5" />
          </button>
          <a
            href={`https://sepolia.etherscan.io/address/${escrow.seller}`}
            target="_blank"
            rel="noreferrer"
            className="text-muted-foreground hover:text-foreground"
            title="Open seller on Etherscan"
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </p>
        <p>
          <strong>Amount:</strong> <EthAmountWithUsd wei={escrow.amount} />
        </p>
        <p><strong>Description:</strong> {escrow.description}</p>
        <p><strong>Created:</strong> {new Date(Number(escrow.createdAt) * 1000).toLocaleString()}</p>

        {onOpenDetails ? (
          <Button variant="secondary" className="w-full" onClick={() => onOpenDetails(escrow)}>
            View details & timeline
          </Button>
        ) : null}

        <Button variant={isWatched ? "default" : "outline"} className="w-full" onClick={() => onToggleWatch(escrow.id)}>
          <Star className="mr-2 h-4 w-4" />
          {isWatched ? "Watching" : "Watch Escrow"}
        </Button>

        {canAct ? (
          <div className="flex gap-2 pt-2">
            <Button className="flex-1" onClick={() => onRelease(escrow.id)}>
              Release Payment
            </Button>
            <Button className="flex-1" variant="destructive" onClick={() => onRefund(escrow.id)}>
              Refund
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
