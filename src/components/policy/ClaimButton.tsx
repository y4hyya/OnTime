"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { claimPolicy } from "@/server/actions/claims";

type Props = {
  policyId: string;
  payoutCents: number;
};

const formatDollars = (cents: number) => (cents / 100).toFixed(2);

export function ClaimButton({ policyId, payoutCents }: Props) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const onConfirm = () => {
    setError(null);
    startTransition(async () => {
      try {
        await claimPolicy(policyId);
        setOpen(false);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (pending) return;
        setOpen(next);
        if (!next) setError(null);
      }}
    >
      <DialogTrigger
        render={
          <Button className="w-full" size="lg">
            Claim ${formatDollars(payoutCents)}
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Confirm payout</DialogTitle>
          <DialogDescription>
            Pay out{" "}
            <span className="font-medium text-foreground">
              ${formatDollars(payoutCents)}
            </span>{" "}
            to your card ending in{" "}
            <span className="font-medium text-foreground">4242</span>.
          </DialogDescription>
        </DialogHeader>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={pending}
          >
            Cancel
          </Button>
          <Button onClick={onConfirm} disabled={pending}>
            {pending ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Processing…
              </>
            ) : (
              "Confirm payout"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
