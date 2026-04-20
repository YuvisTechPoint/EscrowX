"use client";

import { useState } from "react";
import { useWeb3 } from "@/context/Web3Context";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Calendar, Clock, Gift, Sparkles, Loader2, AlertCircle } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { isAddress, parseEther, formatEther } from "ethers";
import TransactionModal from "@/components/TransactionModal";
import { TransactionState } from "@/types";
import { useRouter } from "next/navigation";

type DatePreset = "1week" | "1month" | "6months" | "1year" | "custom";

const DATE_PRESETS: { value: DatePreset; label: string; days: number; icon: string }[] = [
  { value: "1week", label: "1 Week", days: 7, icon: "📅" },
  { value: "1month", label: "1 Month", days: 30, icon: "📆" },
  { value: "6months", label: "6 Months", days: 180, icon: "🗓️" },
  { value: "1year", label: "1 Year", days: 365, icon: "🎂" },
  { value: "custom", label: "Custom", days: 0, icon: "⚙️" },
];

export default function CreateCapsulePage() {
  const { capsuleContract, address, balance } = useWeb3();
  const router = useRouter();
  
  const [formData, setFormData] = useState({
    recipient: "",
    amount: "",
    title: "",
    message: "",
    customDays: "30",
  });
  
  const [selectedPreset, setSelectedPreset] = useState<DatePreset>("1month");
  const [customDate, setCustomDate] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [txState, setTxState] = useState<TransactionState>({
    isOpen: false,
    status: "idle",
  });

  const calculateUnlockDate = (): Date => {
    const now = new Date();
    
    if (selectedPreset === "custom" && customDate) {
      return new Date(customDate);
    }
    
    const preset = DATE_PRESETS.find(p => p.value === selectedPreset);
    if (preset && preset.days > 0) {
      return new Date(now.getTime() + preset.days * 24 * 60 * 60 * 1000);
    }
    
    return new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  };

  const getUnlockTimestamp = (): number => {
    return Math.floor(calculateUnlockDate().getTime() / 1000);
  };

  const getTimeUntil = (): string => {
    const unlockDate = calculateUnlockDate();
    const now = new Date();
    const diffMs = unlockDate.getTime() - now.getTime();
    
    const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const years = Math.floor(days / 365);
    const remainingDays = days % 365;
    
    if (years > 0) {
      return `${years} year${years > 1 ? 's' : ''} and ${remainingDays} days`;
    }
    return `${days} days`;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!capsuleContract || !address) {
      toast.error("Please connect your wallet first");
      return;
    }

    // Validation
    if (!isAddress(formData.recipient)) {
      toast.error("Please enter a valid Ethereum address");
      return;
    }

    if (formData.recipient.toLowerCase() === address.toLowerCase()) {
      toast.error("You cannot send a capsule to yourself");
      return;
    }

    const amount = parseFloat(formData.amount);
    if (isNaN(amount) || amount <= 0) {
      toast.error("Please enter a valid amount");
      return;
    }

    if (parseFloat(balance) < amount) {
      toast.error("Insufficient balance");
      return;
    }

    if (!formData.title.trim()) {
      toast.error("Please enter a title");
      return;
    }

    const unlockTimestamp = getUnlockTimestamp();
    if (unlockTimestamp <= Math.floor(Date.now() / 1000)) {
      toast.error("Unlock date must be in the future");
      return;
    }

    setIsSubmitting(true);
    setTxState({
      isOpen: true,
      status: "loading",
      message: "Creating your time capsule...",
    });

    try {
      // For this implementation, we'll store a hash of the message on-chain
      // In a full implementation, you would encrypt and upload to IPFS
      const messageHash = `0x${Array.from(formData.message)
        .map(c => c.charCodeAt(0).toString(16).padStart(2, '0'))
        .join('')
        .padEnd(64, '0')
        .slice(0, 64)}`;

      const tx = await capsuleContract.createCapsule(
        formData.recipient,
        unlockTimestamp,
        messageHash,
        formData.title,
        { value: parseEther(formData.amount) }
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
        message: "🎉 Your time capsule has been created!",
        txHash: tx.hash,
      });

      toast.success("Time capsule created successfully!");
      
      // Reset form
      setFormData({
        recipient: "",
        amount: "",
        title: "",
        message: "",
        customDays: "30",
      });

      // Redirect after a short delay
      setTimeout(() => {
        router.push("/capsule");
      }, 2000);

    } catch (error: any) {
      console.error("Failed to create capsule:", error);
      setTxState({
        isOpen: true,
        status: "error",
        message: error.message || "Failed to create capsule",
      });
      toast.error(error.message || "Failed to create capsule");
    } finally {
      setIsSubmitting(false);
    }
  };

  const unlockDate = calculateUnlockDate();

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      {/* Header */}
      <div className="flex items-center gap-4 mb-8">
        <Link href="/capsule">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="w-5 h-5" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Create Time Capsule</h1>
          <p className="text-muted-foreground">Send a message through time</p>
        </div>
      </div>

      <div className="grid gap-8 lg:grid-cols-2">
        {/* Form */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Gift className="w-5 h-5" />
              Capsule Details
            </CardTitle>
            <CardDescription>
              Fill in the details for your time-locked gift
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Recipient */}
              <div className="space-y-2">
                <Label htmlFor="recipient">Recipient Address</Label>
                <Input
                  id="recipient"
                  placeholder="0x..."
                  value={formData.recipient}
                  onChange={(e) => setFormData({ ...formData, recipient: e.target.value })}
                  disabled={isSubmitting}
                />
                <p className="text-xs text-muted-foreground">
                  The wallet address that will receive this capsule
                </p>
              </div>

              {/* Amount */}
              <div className="space-y-2">
                <Label htmlFor="amount">ETH Amount</Label>
                <div className="relative">
                  <Input
                    id="amount"
                    type="number"
                    step="0.001"
                    min="0.001"
                    placeholder="0.1"
                    value={formData.amount}
                    onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                    disabled={isSubmitting}
                    className="pr-16"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
                    ETH
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Balance: {parseFloat(balance).toFixed(4)} ETH
                </p>
              </div>

              {/* Title */}
              <div className="space-y-2">
                <Label htmlFor="title">Title</Label>
                <Input
                  id="title"
                  placeholder="e.g., Graduation Gift, Happy 30th Birthday"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  disabled={isSubmitting}
                  maxLength={100}
                />
              </div>

              {/* Message */}
              <div className="space-y-2">
                <Label htmlFor="message">Message (Optional)</Label>
                <Textarea
                  id="message"
                  placeholder="Write a heartfelt message that will be revealed when the capsule is opened..."
                  value={formData.message}
                  onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                  disabled={isSubmitting}
                  rows={4}
                  maxLength={500}
                />
                <p className="text-xs text-muted-foreground text-right">
                  {formData.message.length}/500
                </p>
              </div>

              {/* Date Presets */}
              <div className="space-y-2">
                <Label>Unlock Date</Label>
                <div className="grid grid-cols-5 gap-2">
                  {DATE_PRESETS.map((preset) => (
                    <button
                      key={preset.value}
                      type="button"
                      onClick={() => setSelectedPreset(preset.value)}
                      disabled={isSubmitting}
                      className={`p-2 rounded-lg border text-center transition-all ${
                        selectedPreset === preset.value
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border hover:border-primary/50"
                      }`}
                    >
                      <div className="text-lg mb-1">{preset.icon}</div>
                      <div className="text-xs font-medium">{preset.label}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Custom Date Picker */}
              {selectedPreset === "custom" && (
                <div className="space-y-2">
                  <Label htmlFor="customDate">Select Date & Time</Label>
                  <Input
                    id="customDate"
                    type="datetime-local"
                    value={customDate}
                    onChange={(e) => setCustomDate(e.target.value)}
                    disabled={isSubmitting}
                    min={new Date().toISOString().slice(0, 16)}
                  />
                </div>
              )}

              {/* Submit */}
              <Button
                type="submit"
                className="w-full"
                disabled={isSubmitting || !address}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Creating Capsule...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4 mr-2" />
                    Create Time Capsule
                  </>
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Preview */}
        <div className="space-y-6">
          <Card className="bg-gradient-to-br from-indigo-50 to-purple-50 dark:from-indigo-950/30 dark:to-purple-950/30 border-indigo-200 dark:border-indigo-800">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Clock className="w-5 h-5 text-indigo-600" />
                Timeline Preview
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="relative pl-8 border-l-2 border-indigo-300 dark:border-indigo-700 space-y-6">
                {/* Created */}
                <div className="relative">
                  <div className="absolute -left-[37px] w-4 h-4 rounded-full bg-indigo-500"></div>
                  <div>
                    <p className="font-medium text-sm">Capsule Created</p>
                    <p className="text-xs text-muted-foreground">Today</p>
                  </div>
                </div>

                {/* Locked Period */}
                <div className="relative">
                  <div className="absolute -left-[37px] w-4 h-4 rounded-full bg-amber-400 animate-pulse"></div>
                  <div>
                    <p className="font-medium text-sm">Locked Period</p>
                    <p className="text-xs text-muted-foreground">{getTimeUntil()} remaining</p>
                  </div>
                </div>

                {/* Unlock */}
                <div className="relative">
                  <div className="absolute -left-[37px] w-4 h-4 rounded-full bg-emerald-500"></div>
                  <div>
                    <p className="font-medium text-sm">Unlock Available</p>
                    <p className="text-xs text-muted-foreground">
                      {unlockDate.toLocaleDateString("en-US", {
                        year: "numeric",
                        month: "long",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <AlertCircle className="w-5 h-5 text-amber-500" />
                Important Notes
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <p className="text-muted-foreground">
                <strong>Irreversible:</strong> Once created, the ETH is locked until the unlock date or until you cancel (before unlock).
              </p>
              <p className="text-muted-foreground">
                <strong>Gas fees:</strong> The recipient will need a small amount of ETH for gas to open the capsule.
              </p>
              <p className="text-muted-foreground">
                <strong>Automation:</strong> Capsules can be opened by anyone after the unlock date, enabling automated delivery.
              </p>
            </CardContent>
          </Card>

          {/* Summary Card */}
          {formData.amount && formData.recipient && (
            <Card className="border-emerald-200 dark:border-emerald-800">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">Summary</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Amount</span>
                  <span className="font-medium">{formData.amount} ETH</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Unlock</span>
                  <span className="font-medium">{getTimeUntil()} from now</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Recipient</span>
                  <span className="font-mono text-xs">
                    {formData.recipient.slice(0, 8)}...{formData.recipient.slice(-6)}
                  </span>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      <TransactionModal
        state={txState}
        onClose={() => setTxState({ ...txState, isOpen: false })}
      />
    </div>
  );
}
