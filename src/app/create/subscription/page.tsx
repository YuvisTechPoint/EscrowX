"use client";

import { useState } from "react";
import { useWeb3 } from "@/context/Web3Context";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Repeat, Clock, Loader2 } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { isAddress, parseEther } from "ethers";
import TransactionModal from "@/components/TransactionModal";
import { TransactionState } from "@/types";
import { useRouter } from "next/navigation";

type IntervalPreset = "weekly" | "biweekly" | "monthly" | "quarterly";

const INTERVAL_PRESETS: { value: IntervalPreset; label: string; seconds: number }[] = [
  { value: "weekly", label: "Weekly", seconds: 7 * 24 * 60 * 60 },
  { value: "biweekly", label: "Bi-weekly", seconds: 14 * 24 * 60 * 60 },
  { value: "monthly", label: "Monthly", seconds: 30 * 24 * 60 * 60 },
  { value: "quarterly", label: "Quarterly", seconds: 91 * 24 * 60 * 60 },
];

export default function CreateSubscriptionPage() {
  const { subscriptionContract, address, balance } = useWeb3();
  const router = useRouter();
  
  const [formData, setFormData] = useState({
    seller: "",
    amountPerCycle: "",
    cycles: "12",
    description: "",
  });
  
  const [selectedInterval, setSelectedInterval] = useState<IntervalPreset>("monthly");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [txState, setTxState] = useState<TransactionState>({
    isOpen: false,
    status: "idle",
  });

  const getIntervalSeconds = () => {
    return INTERVAL_PRESETS.find(p => p.value === selectedInterval)?.seconds || 30 * 24 * 60 * 60;
  };

  const getTotalCost = () => {
    const amount = parseFloat(formData.amountPerCycle) || 0;
    const cycles = parseInt(formData.cycles) || 0;
    return amount * cycles;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!subscriptionContract || !address) {
      toast.error("Please connect your wallet first");
      return;
    }

    if (!isAddress(formData.seller)) {
      toast.error("Please enter a valid seller address");
      return;
    }

    const amountPerCycle = parseFloat(formData.amountPerCycle);
    if (isNaN(amountPerCycle) || amountPerCycle < 0.001) {
      toast.error("Amount per cycle must be at least 0.001 ETH");
      return;
    }

    const cycles = parseInt(formData.cycles);
    if (isNaN(cycles) || cycles < 1 || cycles > 100) {
      toast.error("Cycles must be between 1 and 100");
      return;
    }

    const totalCost = getTotalCost();
    if (parseFloat(balance) < totalCost) {
      toast.error(`Insufficient balance. Need ${totalCost.toFixed(4)} ETH`);
      return;
    }

    // Check divisibility
    const totalWei = parseEther(totalCost.toString());
    if (totalWei % BigInt(cycles) !== BigInt(0)) {
      toast.error("Total amount must be divisible by cycles evenly");
      return;
    }

    setIsSubmitting(true);
    setTxState({
      isOpen: true,
      status: "loading",
      message: "Creating subscription...",
    });

    try {
      const tx = await subscriptionContract.createSubscription(
        formData.seller,
        cycles,
        getIntervalSeconds(),
        formData.description,
        { value: totalWei }
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
        message: "Subscription created successfully!",
        txHash: tx.hash,
      });

      toast.success("Subscription created! Funds locked in vault.");
      
      setTimeout(() => {
        router.push("/dashboard");
      }, 2000);

    } catch (error: any) {
      console.error("Failed to create subscription:", error);
      setTxState({
        isOpen: true,
        status: "error",
        message: error.message || "Failed to create subscription",
      });
      toast.error(error.message || "Failed to create subscription");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-2xl">
      <div className="flex items-center gap-4 mb-8">
        <Link href="/dashboard">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="w-5 h-5" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Create Subscription</h1>
          <p className="text-muted-foreground">Set up recurring payments</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Repeat className="w-5 h-5" />
            Subscription Details
          </CardTitle>
          <CardDescription>
            Create a recurring payment that releases automatically on schedule.
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
            </div>

            <div className="space-y-2">
              <Label>Payment Interval</Label>
              <div className="grid grid-cols-4 gap-2">
                {INTERVAL_PRESETS.map((preset) => (
                  <button
                    key={preset.value}
                    type="button"
                    onClick={() => setSelectedInterval(preset.value)}
                    disabled={isSubmitting}
                    className={`p-2 rounded-lg border text-center transition-all ${
                      selectedInterval === preset.value
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border hover:border-primary/50"
                    }`}
                  >
                    <div className="text-xs font-medium">{preset.label}</div>
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="amountPerCycle">Amount Per Cycle</Label>
                <div className="relative">
                  <Input
                    id="amountPerCycle"
                    type="number"
                    step="0.001"
                    min="0.001"
                    placeholder="0.1"
                    value={formData.amountPerCycle}
                    onChange={(e) => setFormData({ ...formData, amountPerCycle: e.target.value })}
                    disabled={isSubmitting}
                    className="pr-16"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
                    ETH
                  </span>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="cycles">Number of Cycles</Label>
                <Input
                  id="cycles"
                  type="number"
                  min="1"
                  max="100"
                  placeholder="12"
                  value={formData.cycles}
                  onChange={(e) => setFormData({ ...formData, cycles: e.target.value })}
                  disabled={isSubmitting}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                placeholder="e.g., Monthly retainer for design services..."
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                disabled={isSubmitting}
                rows={3}
              />
            </div>

            {/* Summary */}
            {formData.amountPerCycle && formData.cycles && (
              <Card className="bg-muted/50 border-dashed">
                <CardContent className="py-4">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm text-muted-foreground">Amount per cycle</span>
                    <span className="font-medium">{formData.amountPerCycle} ETH</span>
                  </div>
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm text-muted-foreground">Number of cycles</span>
                    <span className="font-medium">{formData.cycles}</span>
                  </div>
                  <div className="border-t pt-2 flex justify-between items-center">
                    <span className="font-medium">Total to lock in vault</span>
                    <span className="font-bold text-lg">{getTotalCost().toFixed(4)} ETH</span>
                  </div>
                </CardContent>
              </Card>
            )}

            <Button
              type="submit"
              className="w-full"
              disabled={isSubmitting || !address}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Creating Subscription...
                </>
              ) : (
                <>
                  <Repeat className="w-4 h-4 mr-2" />
                  Create Subscription
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
