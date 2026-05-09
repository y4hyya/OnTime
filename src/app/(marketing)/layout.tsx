import Link from "next/link";
import { Show, SignInButton, UserButton } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";

export default function MarketingLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex h-14 items-center justify-between border-b px-6">
        <Link href="/" className="text-lg font-semibold tracking-tight">
          OnTime
        </Link>
        <div className="flex items-center gap-2">
          <Show
            when="signed-in"
            fallback={
              <SignInButton mode="modal">
                <Button size="sm">Sign in</Button>
              </SignInButton>
            }
          >
            <Link
              href="/quote"
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              Open app
            </Link>
            <UserButton />
          </Show>
        </div>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="border-t">
        <div className="mx-auto max-w-5xl px-6 py-6 text-center text-xs text-muted-foreground">
          OnTime · demo build · not a licensed insurance product yet
        </div>
      </footer>
    </div>
  );
}
