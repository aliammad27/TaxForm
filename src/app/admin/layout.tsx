import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { signOut } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await requireAdmin();

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between border-b px-6 py-3">
        <div className="flex items-center gap-4">
          <Link href="/" className="text-lg font-bold tracking-tight">
            TaxForm
          </Link>
          <Badge>Admin console</Badge>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/dashboard" className="text-sm underline">
            Client view
          </Link>
          <span className="text-sm text-muted-foreground">
            {profile.full_name || profile.email}
          </span>
          <form action={signOut}>
            <Button variant="outline" size="sm">
              Sign out
            </Button>
          </form>
        </div>
      </header>
      <main className="flex-1 p-8">{children}</main>
    </div>
  );
}
