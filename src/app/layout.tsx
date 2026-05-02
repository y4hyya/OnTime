import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import {
  ClerkProvider,
  Show,
  SignInButton,
  UserButton,
} from "@clerk/nextjs";
import Link from "next/link";
import "./globals.css";
import { Button } from "@/components/ui/button";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "OnTime — Coffee money when your flight is late",
  description:
    "AI-priced parametric flight insurance. Tiny premiums, automatic payouts as soon as your flight is delayed.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ClerkProvider>
      <html
        lang="en"
        className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      >
        <body className="min-h-full flex flex-col">
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
                <UserButton />
              </Show>
            </div>
          </header>
          {children}
        </body>
      </html>
    </ClerkProvider>
  );
}
