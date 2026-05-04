import { auth, currentUser } from "@clerk/nextjs/server";

export default async function AccountPage() {
  const { userId } = await auth();
  const user = await currentUser();

  if (!userId || !user) {
    return null;
  }

  const primaryEmail = user.emailAddresses.find(
    (e) => e.id === user.primaryEmailAddressId,
  );

  return (
    <div className="space-y-2">
      <h1 className="text-2xl font-semibold tracking-tight">Account</h1>
      <p className="text-muted-foreground">
        {primaryEmail?.emailAddress ?? "No primary email"}
      </p>
      <p className="text-xs text-muted-foreground">
        Clerk user ID: <code className="font-mono">{userId}</code>
      </p>
    </div>
  );
}
