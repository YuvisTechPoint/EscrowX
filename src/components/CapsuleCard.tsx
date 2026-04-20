"use client";

import { useState, useEffect } from "react";
import { useWeb3 } from "@/context/Web3Context";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Clock, Gift, Lock, Unlock, Loader2 } from "lucide-react";
import { Capsule } from "@/types";
import { formatEther } from "ethers";

interface CapsuleCardProps {
  capsule: Capsule;
  onOpen?: (id: bigint) => void;
  onCancel?: (id: bigint) => void;
  isRecipient?: boolean;
  isSender?: boolean;
}

function formatTimeRemaining(seconds: bigint): string {
  const secs = Number(seconds);
  if (secs <= 0) return "Unlocked!";
  
  const days = Math.floor(secs / 86400);
  const hours = Math.floor((secs % 86400) / 3600);
  const minutes = Math.floor((secs % 3600) / 60);
  
  if (days > 365) {
    const years = Math.floor(days / 365);
    const remainingDays = days % 365;
    return `${years}y ${remainingDays}d`;
  }
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function getUnlockDateString(timestamp: bigint): string {
  const date = new Date(Number(timestamp) * 1000);
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function CapsuleCard({
  capsule,
  onOpen,
  onCancel,
  isRecipient = false,
  isSender = false,
}: CapsuleCardProps) {
  const { address } = useWeb3();
  const [timeRemaining, setTimeRemaining] = useState<bigint>(BigInt(0));
  const [isOpening, setIsOpening] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  
  const canOpen = !capsule.opened && timeRemaining === BigInt(0);
  const canCancel = isSender && !capsule.opened && timeRemaining > BigInt(0);
  const isLocked = !capsule.opened && timeRemaining > BigInt(0);

  useEffect(() => {
    const calculateTimeRemaining = () => {
      const now = Math.floor(Date.now() / 1000);
      const unlockTime = Number(capsule.unlockDate);
      const remaining = Math.max(0, unlockTime - now);
      setTimeRemaining(BigInt(remaining));
    };

    calculateTimeRemaining();
    const interval = setInterval(calculateTimeRemaining, 1000);
    return () => clearInterval(interval);
  }, [capsule.unlockDate]);

  const handleOpen = async () => {
    if (!onOpen) return;
    setIsOpening(true);
    try {
      await onOpen(capsule.id);
    } finally {
      setIsOpening(false);
    }
  };

  const handleCancel = async () => {
    if (!onCancel) return;
    setIsCancelling(true);
    try {
      await onCancel(capsule.id);
    } finally {
      setIsCancelling(false);
    }
  };

  const truncateAddress = (addr: string) =>
    `${addr.slice(0, 6)}...${addr.slice(-4)}`;

  return (
    <Card className={`overflow-hidden transition-all duration-300 ${
      capsule.opened 
        ? "bg-muted/50 border-muted" 
        : isLocked 
          ? "border-amber-500/30 bg-gradient-to-br from-amber-50/5 to-transparent dark:from-amber-900/5" 
          : "border-emerald-500/30 bg-gradient-to-br from-emerald-50/5 to-transparent dark:from-emerald-900/5"
    }`}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            {capsule.opened ? (
              <div className="w-10 h-10 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                <Gift className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
              </div>
            ) : isLocked ? (
              <div className="w-10 h-10 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center animate-pulse">
                <Lock className="w-5 h-5 text-amber-600 dark:text-amber-400" />
              </div>
            ) : (
              <div className="w-10 h-10 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center animate-bounce">
                <Unlock className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
              </div>
            )}
            <div>
              <h3 className="font-semibold text-lg leading-tight">{capsule.title}</h3>
              <p className="text-xs text-muted-foreground">
                Capsule #{capsule.id.toString()}
              </p>
            </div>
          </div>
          <Badge
            variant={capsule.opened ? "secondary" : isLocked ? "outline" : "default"}
            className={`
              ${capsule.opened ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" : ""}
              ${isLocked ? "border-amber-500 text-amber-600" : ""}
              ${!capsule.opened && !isLocked ? "bg-emerald-500 text-white" : ""}
            `}
          >
            {capsule.opened ? "Opened" : isLocked ? "Locked" : "Ready!"}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Amount - blurred if locked and not recipient */}
        <div className="flex items-center justify-between py-2 border-y">
          <span className="text-sm text-muted-foreground">Amount</span>
          <span className={`font-mono font-semibold ${
            isLocked && !isRecipient ? "blur-sm select-none" : ""
          }`}>
            {formatEther(capsule.amount)} ETH
          </span>
        </div>

        {/* Countdown Timer */}
        <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
          <Clock className="w-4 h-4 text-muted-foreground" />
          <div className="flex-1">
            {capsule.opened ? (
              <p className="text-sm text-muted-foreground">Opened on {getUnlockDateString(capsule.unlockDate)}</p>
            ) : (
              <>
                <p className="text-sm font-medium">
                  {isLocked ? `Unlocks in ${formatTimeRemaining(timeRemaining)}` : "Ready to open!"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {getUnlockDateString(capsule.unlockDate)}
                </p>
              </>
            )}
          </div>
          {isLocked && (
            <div className="text-right">
              <span className="text-lg font-mono font-bold text-amber-600 dark:text-amber-400">
                {formatTimeRemaining(timeRemaining)}
              </span>
            </div>
          )}
        </div>

        {/* Addresses */}
        <div className="space-y-1 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">From</span>
            <span className="font-mono">{truncateAddress(capsule.sender)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">To</span>
            <span className="font-mono">{truncateAddress(capsule.recipient)}</span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-2 pt-2">
          {canOpen && isRecipient && (
            <Button
              onClick={handleOpen}
              disabled={isOpening}
              className="flex-1 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600"
            >
              {isOpening ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Opening...
                </>
              ) : (
                <>
                  <Gift className="w-4 h-4 mr-2" />
                  Open Capsule
                </>
              )}
            </Button>
          )}
          
          {canCancel && (
            <Button
              onClick={handleCancel}
              disabled={isCancelling}
              variant="outline"
              className="flex-1"
            >
              {isCancelling ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Cancelling...
                </>
              ) : (
                "Cancel & Refund"
              )}
            </Button>
          )}

          {capsule.opened && (
            <div className="flex-1 text-center py-2 text-sm text-emerald-600 dark:text-emerald-400">
              ✓ This capsule has been opened
            </div>
          )}

          {isLocked && isRecipient && (
            <div className="flex-1 text-center py-2 text-sm text-amber-600 dark:text-amber-400">
              <Lock className="w-4 h-4 inline mr-1" />
              Wait for unlock date
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
