"use client";

import { useState, useTransition } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { refreshPolicyFlight } from "@/server/actions/monitor";

export function CheckNowButton({ policyId }: { policyId: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const onClick = () => {
    setError(null);
    startTransition(async () => {
      try {
        await refreshPolicyFlight(policyId);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    });
  };

  return (
    <div className="space-y-2">
      <Button
        variant="outline"
        onClick={onClick}
        disabled={pending}
        className="w-full"
      >
        {pending ? (
          <>
            <Loader2 className="size-4 animate-spin" />
            Checking…
          </>
        ) : (
          <>
            <RefreshCw className="size-4" />
            Check now
          </>
        )}
      </Button>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
