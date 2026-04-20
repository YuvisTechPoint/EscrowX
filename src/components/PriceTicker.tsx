"use client";

import { useEffect, useState } from "react";
import { TrendingUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { getEthUsdQuote, formatUsd } from "@/lib/chainlink";

export default function PriceTicker() {
  const [price, setPrice] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const q = await getEthUsdQuote({ maxAgeMs: 15_000 });
        if (!cancelled) setPrice(q.price);
      } catch {
        if (!cancelled) setPrice(null);
      }
    };

    void load();
    const interval = window.setInterval(() => void load(), 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  if (!price) return null;

  return (
    <Badge variant="secondary" className="hidden items-center gap-2 md:inline-flex">
      <TrendingUp className="h-3.5 w-3.5" />
      ETH {formatUsd(price)}
    </Badge>
  );
}

