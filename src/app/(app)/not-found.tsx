import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function AppNotFound() {
  return (
    <div className="flex flex-1 items-center justify-center">
      <div className="max-w-sm space-y-4 text-center">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">
            Not found
          </h1>
          <p className="text-sm text-muted-foreground">
            We couldn&rsquo;t find that. It may have been removed, or you
            don&rsquo;t have access.
          </p>
        </div>
        <div className="flex justify-center gap-2">
          <Button nativeButton={false} render={<Link href="/policies" />}>
            My policies
          </Button>
          <Button
            variant="outline"
            nativeButton={false}
            render={<Link href="/quote" />}
          >
            New quote
          </Button>
        </div>
      </div>
    </div>
  );
}
