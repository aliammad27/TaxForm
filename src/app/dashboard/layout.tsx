import Link from "next/link";
import { requireClient } from "@/lib/auth";
import { signOut } from "@/app/(auth)/actions";
import { DashboardNav, type NavItem } from "@/components/dashboard-nav";
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
    { href: "/dashboard", label: "Overview" },
    { href: "/dashboard/properties", label: "Properties" },
    { href: "/dashboard/appeals", label: "Appeals" },
    { href: "/dashboard/documents", label: "Documents" },
    ...(isCommercial
      ? [{ href: "/dashboard/portfolio", label: "Portfolio Analytics" }]
      : []),
  ];

  return (
    <div className="flex min-h-screen">
      <aside className="flex w-60 flex-col border-r bg-muted/30 p-4">
        <Link href="/" className="mb-6 px-3 text-lg font-bold tracking-tight">
          TaxForm
        </Link>
        <DashboardNav items={items} />
        <div className="mt-auto space-y-3 px-3 pt-6">
          {profile.role === "admin" && (
            <Link href="/admin" className="block text-sm underline">
              Admin console
            </Link>
          )}
          <div className="text-sm">
            <p className="truncate font-medium">{profile.full_name || profile.email}</p>
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
      <main className="flex-1 p-8">{children}</main>
    </div>
  );
}
