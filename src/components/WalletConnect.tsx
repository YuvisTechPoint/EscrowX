"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useWeb3, isSepolia } from "@/context/Web3Context";
import { truncateAddress, SEPOLIA_CHAIN_ID_HEX } from "@/lib/web3";

export default function WalletConnect() {
  const { address, balance, chainId, connect, disconnect, isConnecting } = useWeb3();
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const handleNetworkSwitch = async () => {
    try {
      if (!window.ethereum) return;
      await window.ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: SEPOLIA_CHAIN_ID_HEX }],
      });
    } catch (error) {
      console.error("Network switch failed:", error);
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

  if (!isMounted) {
    return null;
  }

  if (typeof window === "undefined" || !window.ethereum) {
    return (
      <div className="rounded-md border border-yellow-500/40 bg-yellow-500/10 px-3 py-2 text-xs md:text-sm">
        MetaMask not installed. <Link className="underline" href="https://metamask.io/download/">Install MetaMask</Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-end gap-2">
      {!address ? (
        <Button onClick={() => void handleConnect()} disabled={isConnecting}>
          {isConnecting ? "Connecting..." : "Connect Wallet"}
        </Button>
      ) : (
        <div className="flex items-center gap-2">
          <div className="rounded-md border px-3 py-1 text-xs md:text-sm">
            {truncateAddress(address)} | {balance} ETH
          </div>
          <Button variant="outline" onClick={disconnect}>
            Disconnect
          </Button>
        </div>
      )}

      {address && !isSepolia(chainId) ? (
        <div className="flex items-center gap-2 rounded-md border border-yellow-500/40 bg-yellow-500/10 px-3 py-2 text-xs md:text-sm">
          <AlertTriangle className="h-4 w-4" />
          Wrong network. Switch to Sepolia.
          <Button size="sm" variant="secondary" onClick={() => void handleNetworkSwitch()}>
            Auto-switch
          </Button>
        </div>
      ) : null}
    </div>
  );
}
