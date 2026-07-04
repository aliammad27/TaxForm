"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Building2,
  ChartNoAxesCombined,
  FileText,
  Gavel,
  LayoutDashboard,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

const ICONS: Record<string, LucideIcon> = {
  overview: LayoutDashboard,
  properties: Building2,
  appeals: Gavel,
  documents: FileText,
  portfolio: ChartNoAxesCombined,
};

export type NavItem = { href: string; label: string; icon?: string };

function isActive(pathname: string, href: string) {
  return href === "/dashboard" || href === "/admin"
    ? pathname === href
    : pathname.startsWith(href);
}

export function DashboardNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  return (
    <nav className="flex flex-col gap-1">
      {items.map((item) => {
        const active = isActive(pathname, item.href);
        const Icon = item.icon ? ICONS[item.icon] : undefined;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-sm"
                : "text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            )}
          >
            {Icon && <Icon className="size-4 shrink-0" />}
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function DashboardMobileNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  return (
    <nav className="flex gap-1 overflow-x-auto px-4 pb-2">
      {items.map((item) => {
        const active = isActive(pathname, item.href);
        const Icon = item.icon ? ICONS[item.icon] : undefined;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-colors",
              active
                ? "bg-sidebar-primary text-sidebar-primary-foreground"
                : "text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            )}
          >
            {Icon && <Icon className="size-3.5" />}
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
