"use client";

import { useEffect } from "react";
import { AlertTriangle, RefreshCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("App error boundary:", error);
  }, [error]);

  return (
    <div className="mx-auto max-w-2xl rounded-xl border p-8">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 text-yellow-500" />
        <div className="space-y-2">
          <h2 className="text-xl font-semibold">Something went wrong</h2>
          <p className="text-sm text-muted-foreground">
            Try reloading this page. If the issue persists, verify your RPC URL and contract address configuration.
          </p>
          <div className="flex flex-wrap gap-2 pt-2">
            <Button onClick={reset}>
              <RefreshCcw className="mr-2 h-4 w-4" />
              Retry
            </Button>
            <Button variant="outline" onClick={() => window.location.reload()}>
              Reload
            </Button>
          </div>
          <p className="pt-2 text-xs text-muted-foreground">Digest: {error.digest ?? "n/a"}</p>
        </div>
      </div>
    </div>
  );
}

