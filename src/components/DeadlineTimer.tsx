"use client";

import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";

type Props = {
  deadline: bigint;
};

function formatRemaining(ms: number) {
  const totalMinutes = Math.max(0, Math.floor(ms / 60000));
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

export default function DeadlineTimer({ deadline }: Props) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(interval);
  }, []);

  const deadlineMs = Number(deadline) * 1000;
  const remainingMs = deadlineMs - now;
  const isExpired = remainingMs <= 0;
  const isUrgent = !isExpired && remainingMs <= 24 * 60 * 60 * 1000;

  const label = useMemo(() => {
    if (deadline === 0n) return null;
    if (isExpired) return "Expired";
    return `Ends in ${formatRemaining(remainingMs)}`;
  }, [deadline, isExpired, remainingMs]);

  if (!label) return null;

  return (
    <Badge className={isExpired ? "bg-red-600 text-white" : isUrgent ? "bg-yellow-500 text-black" : "bg-secondary"}>
      {label}
    </Badge>
  );
}

