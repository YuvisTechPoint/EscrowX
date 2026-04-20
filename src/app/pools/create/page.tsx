"use client";

import { useState, useEffect } from "react";
import { useWeb3 } from "@/context/Web3Context";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Users, Target, Clock, Loader2 } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { isAddress, parseEther } from "ethers";
import TransactionModal from "@/components/TransactionModal";
import { TransactionState } from "@/types";
import { useRouter } from "next/navigation";

export default function CreatePoolPage() {
  const { poolContract, address, balance } = useWeb3();
  const router = useRouter();
  
  const [formData, setFormData] = useState({
    seller: "",
    targetAmount: "",
    deadlineDays: "7",
    description: "",
  });
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [txState, setTxState] = useState<TransactionState>({
    isOpen: false,
    status: "idle",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!poolContract || !address) {
      toast.error("Please connect your wallet first");
      return;
    }

    if (!isAddress(formData.seller)) {
      toast.error("Please enter a valid seller address");
      return;
    }

    const targetAmount = parseFloat(formData.targetAmount);
    if (isNaN(targetAmount) || targetAmount < 0.01) {
      toast.error("Target amount must be at least 0.01 ETH");
      return;
    }

    const deadlineDays = parseInt(formData.deadlineDays);
    if (isNaN(deadlineDays) || deadlineDays < 1 || deadlineDays > 90) {
      toast.error("Deadline must be between 1 and 90 days");
      return;
    }

    setIsSubmitting(true);
    setTxState({
      isOpen: true,
      status: "loading",
      message: "Creating pool escrow...",
    });

    try {
      const tx = await poolContract.createPoolEscrow(
        formData.seller,
        parseEther(formData.targetAmount),
        deadlineDays,
        formData.description
      );

      setTxState({
        isOpen: true,
        status: "loading",
        message: "Waiting for confirmation...",
        txHash: tx.hash,
      });

      await tx.wait();

      setTxState({
        isOpen: true,
        status: "success",
        message: "Pool escrow created successfully!",
        txHash: tx.hash,
      });

      toast.success("Pool created! Others can now contribute.");
      
      setTimeout(() => {
        router.push("/pools");
      }, 2000);

    } catch (error: any) {
      console.error("Failed to create pool:", error);
      setTxState({
        isOpen: true,
        status: "error",
        message: error.message || "Failed to create pool",
      });
      toast.error(error.message || "Failed to create pool");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-2xl">
      <div className="flex items-center gap-4 mb-8">
        <Link href="/pools">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="w-5 h-5" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Create Pool Escrow</h1>
          <p className="text-muted-foreground">Crowdfund with community voting</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="w-5 h-5" />
            Pool Details
          </CardTitle>
          <CardDescription>
            Create a group funding escrow. Contributors vote on release/refund.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="seller">Seller Address</Label>
              <Input
                id="seller"
                placeholder="0x..."
                value={formData.seller}
                onChange={(e) => setFormData({ ...formData, seller: e.target.value })}
                disabled={isSubmitting}
              />
              <p className="text-xs text-muted-foreground">
                The address that will receive funds when the pool is released
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="targetAmount">Target Amount (ETH)</Label>
              <div className="relative">
                <Input
                  id="targetAmount"
                  type="number"
                  step="0.01"
                  min="0.01"
                  placeholder="1.0"
                  value={formData.targetAmount}
                  onChange={(e) => setFormData({ ...formData, targetAmount: e.target.value })}
                  disabled={isSubmitting}
                  className="pr-16"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
                  ETH
                </span>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="deadline">Funding Deadline (Days)</Label>
              <div className="relative">
                <Input
                  id="deadline"
                  type="number"
                  min="1"
                  max="90"
                  placeholder="7"
                  value={formData.deadlineDays}
                  onChange={(e) => setFormData({ ...formData, deadlineDays: e.target.value })}
                  disabled={isSubmitting}
                  className="pr-16"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
                  days
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                Pool must reach target within this timeframe (1-90 days)
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                placeholder="What is this pool for? Describe the project or service..."
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                disabled={isSubmitting}
                rows={3}
              />
            </div>

            <Button
              type="submit"
              className="w-full"
              disabled={isSubmitting || !address}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Creating Pool...
                </>
              ) : (
                <>
                  <Users className="w-4 h-4 mr-2" />
                  Create Pool Escrow
                </>
              )}
            </Button>
          </form>
        </CardContent>
      </Card>

      <TransactionModal
        state={txState}
        onClose={() => setTxState({ ...txState, isOpen: false })}
      />
    </div>
  );
}
