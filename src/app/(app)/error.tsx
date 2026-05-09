"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[app] route error:", error);
  }, [error]);

  return (
    <div className="flex flex-1 items-center justify-center">
      <div className="max-w-sm space-y-4 text-center">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">
            Something went wrong
          </h1>
          <p className="text-sm text-muted-foreground">
            An unexpected error happened. Try again, or head back to your
            policies.
          </p>
        </div>
        <div className="flex justify-center gap-2">
          <Button onClick={reset}>Try again</Button>
          <Button
            variant="outline"
            nativeButton={false}
            render={<Link href="/policies" />}
          >
            My policies
          </Button>
        </div>
        {error.digest && (
          <p className="font-mono text-xs text-muted-foreground">
            ref: {error.digest}
          </p>
        )}
      </div>
    </div>
  );
}
