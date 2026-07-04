import Link from "next/link";
import { requireClient } from "@/lib/auth";
import { signOut } from "@/app/(auth)/actions";
import {
  DashboardNav,
  DashboardMobileNav,
  type NavItem,
} from "@/components/dashboard-nav";
import { Logo } from "@/components/logo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const TIER_LABELS: Record<string, string> = {
  residential_diy: "Residential DIY",
  commercial_contingency: "Commercial",
  full_service: "Full Service",
};

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await requireClient();
  const isCommercial = profile.tier !== "residential_diy";

  const items: NavItem[] = [
    { href: "/dashboard", label: "Overview", icon: "overview" },
    { href: "/dashboard/properties", label: "Properties", icon: "properties" },
    { href: "/dashboard/appeals", label: "Appeals", icon: "appeals" },
    { href: "/dashboard/documents", label: "Documents", icon: "documents" },
    ...(isCommercial
      ? [
          {
            href: "/dashboard/portfolio",
            label: "Portfolio Analytics",
            icon: "portfolio",
          },
        ]
      : []),
  ];

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-screen w-64 flex-col border-r bg-sidebar px-4 py-6 text-sidebar-foreground md:flex">
        <Logo className="mb-9 px-3 text-[24px]" />
        <DashboardNav items={items} />
        <div className="mt-auto space-y-3 border-t px-3 pt-4">
          {profile.role === "admin" && (
            <Link
              href="/admin"
              className="text-[13.5px] font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              Admin console →
            </Link>
          )}
          <div className="text-sm">
            <p className="truncate font-medium">
              {profile.full_name || profile.email}
            </p>
            <Badge variant="secondary" className="mt-1">
              {TIER_LABELS[profile.tier]}
            </Badge>
          </div>
          <form action={signOut}>
            <Button variant="outline" size="sm" className="w-full">
              Sign out
            </Button>
          </form>
        </div>
      </aside>

      {/* Mobile header */}
      <div className="sticky top-0 z-40 border-b bg-sidebar md:hidden">
        <div className="flex items-center justify-between px-4 py-3">
          <Logo />
          <form action={signOut}>
            <Button variant="ghost" size="sm">
              Sign out
            </Button>
          </form>
        </div>
        <DashboardMobileNav items={items} />
      </div>

      <main className="min-w-0 flex-1 bg-background px-6 py-10 sm:px-12">
        <div className="mx-auto w-full max-w-[960px]">{children}</div>
      </main>
    </div>
  );
}
