import { UserButton } from "@clerk/nextjs";
import { Sidebar } from "@/components/app/Sidebar";

export default function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center justify-end border-b px-6">
          <UserButton />
        </header>
        <main className="flex flex-1 flex-col overflow-hidden p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
