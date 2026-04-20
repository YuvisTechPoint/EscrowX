"use client";

import { useEffect, useMemo, useState } from "react";
import { ethers } from "ethers";
import { ethToUsd, formatUsd, getEthUsdQuote } from "@/lib/chainlink";

type Props = {
  wei: bigint;
  className?: string;
  showEthSuffix?: boolean;
};

export default function EthAmountWithUsd({ wei, className, showEthSuffix = true }: Props) {
  const [ethUsd, setEthUsd] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const q = await getEthUsdQuote();
        if (!cancelled) setEthUsd(q.price);
      } catch {
        if (!cancelled) setEthUsd(null);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const eth = useMemo(() => ethers.formatEther(wei), [wei]);
  const usd = useMemo(() => (ethUsd ? ethToUsd(wei, ethUsd) : null), [wei, ethUsd]);

  return (
    <span className={className}>
      {eth} {showEthSuffix ? "ETH" : null}
      {usd !== null ? <span className="ml-2 text-xs text-muted-foreground">≈ {formatUsd(usd)}</span> : null}
    </span>
  );
}

