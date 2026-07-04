import Link from "next/link";
import { LogOut, PanelsTopLeft } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { signOut } from "@/app/(auth)/actions";
import { Logo } from "@/components/logo";
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
      <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur">
        <div className="flex items-center justify-between px-6 py-3">
          <div className="flex items-center gap-3">
            <Logo />
            <Badge>Admin console</Badge>
          </div>
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              render={<Link href="/dashboard" />}
            >
              <PanelsTopLeft data-icon="inline-start" />
              Client view
            </Button>
            <span className="hidden text-sm text-muted-foreground sm:inline">
              {profile.full_name || profile.email}
            </span>
            <form action={signOut}>
              <Button variant="outline" size="sm">
                <LogOut data-icon="inline-start" />
                Sign out
              </Button>
            </form>
          </div>
        </div>
      </header>
      <main className="flex-1 p-4 sm:p-8">
        <div className="mx-auto w-full max-w-6xl">{children}</div>
      </main>
    </div>
  );
}
