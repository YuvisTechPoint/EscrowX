"use client";

import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { isAddress } from "ethers";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import DealAnalyzer from "@/components/DealAnalyzer";
import TransactionModal from "@/components/TransactionModal";
import { useWeb3 } from "@/context/Web3Context";
import { loadAddressBook, upsertAddressBookEntry, type AddressBookEntry } from "@/lib/addressBook";
import { createEscrowWithDeadline } from "@/lib/contract";
import type { TransactionState } from "@/types";

export default function CreateEscrowPage() {
  const router = useRouter();
  const { address, balance, connect, isConnecting } = useWeb3();

  const [seller, setSeller] = useState("");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [deadlineDays, setDeadlineDays] = useState("0");
  const [isLoading, setIsLoading] = useState(false);
  const [addressBook, setAddressBook] = useState<AddressBookEntry[]>([]);
  const [sellerLabel, setSellerLabel] = useState("");

  const [txState, setTxState] = useState<TransactionState>({
    isOpen: false,
    status: "idle",
  });

  const handleSellerChange = (e: ChangeEvent<HTMLInputElement>) => {
    setSeller(e.target.value);
  };

  const handleAmountChange = (e: ChangeEvent<HTMLInputElement>) => {
    setAmount(e.target.value);
  };

  const handleDescriptionChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    setDescription(e.target.value);
  };

  useEffect(() => {
    try {
      setAddressBook(loadAddressBook());
    } catch {
      setAddressBook([]);
    }
  }, []);

  const addressBookSuggestions = useMemo(() => addressBook.slice(0, 6), [addressBook]);

  const useMaxAmount = () => {
    const numericBalance = Number(balance);
    if (!Number.isFinite(numericBalance) || numericBalance <= 0) {
      toast.error("No wallet balance detected.");
      return;
    }

    // Keep a small gas reserve so the transaction can be mined.
    const suggested = Math.max(numericBalance - 0.0002, 0);
    if (suggested <= 0) {
      toast.error("Balance is too low after gas reserve.");
      return;
    }

    setAmount(suggested.toFixed(4));
  };

  const validateForm = (): string | null => {
    if (!address) return "Please connect your wallet first.";
    if (!isAddress(seller)) return "Seller wallet address is invalid.";
    if (seller.toLowerCase() === address.toLowerCase()) {
      return "Seller address cannot be your own connected wallet. Use a different seller wallet.";
    }
    if (!amount || Number(amount) <= 0) return "Amount must be greater than 0.";
    if (!description.trim()) return "Description is required.";
    const days = Number(deadlineDays);
    if (!Number.isFinite(days) || days < 0 || days > 3650) return "Deadline days must be between 0 and 3650.";
    return null;
  };

  const handleCreateEscrow = async () => {
    try {
      const validationError = validateForm();
      if (validationError) {
        toast.error(validationError);
        return;
      }

      setIsLoading(true);
      setTxState({ isOpen: true, status: "loading" });

      const { hash } = await createEscrowWithDeadline(seller, amount, description, Number(deadlineDays));

      try {
        const next = upsertAddressBookEntry({ address: seller, label: sellerLabel });
        setAddressBook(next);
      } catch {
        // ignore localStorage failures
      }

      setTxState({ isOpen: true, status: "success", txHash: hash });
      toast.success("Escrow created successfully.", {
        action: {
          label: "View Tx",
          onClick: () => window.open(`https://sepolia.etherscan.io/tx/${hash}`, "_blank"),
        },
      });

      setTimeout(() => router.push("/dashboard"), 1200);
    } catch (error: unknown) {
      console.error("handleCreateEscrow error:", error);
      const message =
        error instanceof Error
          ? error.message
          : "Failed to create escrow. Ensure wallet is connected and has enough funds.";

      const prettyMessage = message.includes("user rejected")
        ? "Transaction rejected in MetaMask."
        : message.includes("insufficient funds")
          ? "Insufficient funds for transaction + gas."
          : message.includes("Buyer and seller cannot be same")
            ? "Seller address cannot be your own connected wallet. Use a different seller wallet."
            : message.includes("does not support deadline escrows")
              ? "This deployed contract version does not support deadlines. Set deadline to 0 or redeploy the latest contract."
          : message;

      setTxState({ isOpen: true, status: "error", message: prettyMessage });
      toast.error(prettyMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const handleConnect = async () => {
    try {
      await connect();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to connect wallet.";
      const prettyMessage = message.includes("user rejected")
        ? "Wallet connection was rejected in MetaMask."
        : message;
      toast.error(prettyMessage);
    }
  };

  return (
    <div className="mx-auto max-w-2xl">
      <Card>
        <CardHeader>
          <CardTitle>Create New Escrow</CardTitle>
          <CardDescription>Deposit ETH for a secure transaction with a seller.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {!address ? (
            <Button onClick={() => void handleConnect()} disabled={isConnecting}>
              {isConnecting ? "Connecting..." : "Connect Wallet to Continue"}
            </Button>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor="seller">Seller Wallet Address</Label>
            <Input
              id="seller"
              value={seller}
              onChange={handleSellerChange}
              placeholder="0x..."
              list="seller-suggestions"
            />
            <datalist id="seller-suggestions">
              {addressBookSuggestions.map((e) => (
                <option key={e.address} value={e.address}>
                  {e.label ? `${e.label} (${e.address})` : e.address}
                </option>
              ))}
            </datalist>
            {seller.length > 0 && !isAddress(seller) ? (
              <p className="text-sm text-red-500">Enter a valid Ethereum address.</p>
            ) : null}
            {isAddress(seller) && address && seller.toLowerCase() === address.toLowerCase() ? (
              <p className="text-sm text-red-500">
                Seller cannot be your own connected wallet. Use a different address.
              </p>
            ) : null}
            <div className="space-y-2 pt-2">
              <Label htmlFor="sellerLabel">Optional seller label (saved locally)</Label>
              <Input
                id="sellerLabel"
                value={sellerLabel}
                onChange={(e) => setSellerLabel(e.target.value)}
                placeholder="e.g., Designer, Vendor A"
              />
              {addressBook.length ? (
                <p className="text-xs text-muted-foreground">
                  Tip: start typing and pick a recent seller address from suggestions.
                </p>
              ) : null}
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="amount">Amount (ETH)</Label>
              <button
                type="button"
                onClick={useMaxAmount}
                className="text-xs text-blue-400 hover:text-blue-300"
              >
                Use max (minus gas)
              </button>
            </div>
            <Input
              id="amount"
              type="number"
              min="0"
              step="0.0001"
              value={amount}
              onChange={handleAmountChange}
              placeholder="0.1"
            />
            <p className="text-xs text-muted-foreground">Available: {balance} ETH</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={description}
              onChange={handleDescriptionChange}
              placeholder="Describe deliverables or order details..."
            />
          </div>

          <DealAnalyzer
            description={description}
            amountEth={amount}
            sellerAddress={seller}
            onApplySummary={(summary) => setDescription((prev) => `${prev.trim()}\n\n${summary}`.trim())}
          />

          <div className="space-y-2">
            <Label htmlFor="deadlineDays">Deadline (days)</Label>
            <Input
              id="deadlineDays"
              type="number"
              min="0"
              step="1"
              value={deadlineDays}
              onChange={(e) => setDeadlineDays(e.target.value)}
              placeholder="0"
            />
            <p className="text-xs text-muted-foreground">
              If payment isn&apos;t released within X days, anyone can trigger an expired refund back to the buyer.
              Use 0 for no deadline.
            </p>
          </div>

          <Button className="w-full" disabled={isLoading} onClick={() => void handleCreateEscrow()}>
            {isLoading ? "Waiting for confirmation..." : "Create Escrow"}
          </Button>
        </CardContent>
      </Card>

      <TransactionModal
        state={txState}
        onClose={() => setTxState((prev) => ({ ...prev, isOpen: false }))}
        onRetry={() => void handleCreateEscrow()}
      />
    </div>
  );
}
