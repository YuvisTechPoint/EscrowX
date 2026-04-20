"use client";

import Link from "next/link";
import { Loader2, CircleCheckBig, CircleX } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { TransactionState } from "@/types";

type Props = {
  state: TransactionState;
  onClose: () => void;
  onRetry?: () => void;
};

export default function TransactionModal({ state, onClose, onRetry }: Props) {
  return (
    <Dialog open={state.isOpen} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Transaction Status</DialogTitle>
          <DialogDescription>Track wallet confirmation and blockchain finalization.</DialogDescription>
        </DialogHeader>

        {state.status === "loading" ? (
          <div className="flex flex-col items-center gap-3 py-4">
            <Loader2 className="h-10 w-10 animate-spin text-primary" />
            <p>Confirming transaction...</p>
          </div>
        ) : null}

        {state.status === "success" ? (
          <div className="flex flex-col items-center gap-3 py-4">
            <CircleCheckBig className="h-10 w-10 text-green-500" />
            <p className="text-center">Transaction succeeded.</p>
            {state.txHash ? (
              <Link
                className="text-sm text-primary underline"
                href={`https://sepolia.etherscan.io/tx/${state.txHash}`}
                target="_blank"
              >
                View on Etherscan
              </Link>
            ) : null}
            <Button onClick={onClose}>Close</Button>
          </div>
        ) : null}

        {state.status === "error" ? (
          <div className="flex flex-col items-center gap-3 py-4">
            <CircleX className="h-10 w-10 text-red-500" />
            <p className="text-center">{state.message || "Transaction failed."}</p>
            {onRetry ? <Button onClick={onRetry}>Retry</Button> : null}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
