import Link from "next/link";
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
    <div className="flex min-h-screen flex-col bg-background">
      <header className="sticky top-0 z-40 border-b bg-background/85 backdrop-blur">
        <div className="flex items-center justify-between px-7 py-3">
          <div className="flex items-center gap-3.5">
            <Logo className="text-[24px]" />
            <Badge>Admin console</Badge>
          </div>
          <div className="flex items-center gap-3.5">
            <Button
              variant="ghost"
              size="sm"
              render={<Link href="/dashboard" />}
            >
              Client view
            </Button>
            <span className="hidden text-[13.5px] text-muted-foreground sm:inline">
              {profile.full_name || profile.email}
            </span>
            <form action={signOut}>
              <Button variant="outline" size="sm">
                Sign out
              </Button>
            </form>
          </div>
        </div>
      </header>
      <main className="flex-1 px-7 py-9">
        <div className="mx-auto w-full max-w-6xl">{children}</div>
      </main>
    </div>
  );
}
