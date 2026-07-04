"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

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
      {items.map((item, index) => {
        const active = isActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex items-baseline gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors",
              active
                ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-sm"
                : "text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            )}
          >
            <span className="font-mono text-[11px] opacity-70">
              {String(index + 1).padStart(2, "0")}
            </span>
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
      {items.map((item, index) => {
        const active = isActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex shrink-0 items-baseline gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-colors",
              active
                ? "bg-sidebar-primary text-sidebar-primary-foreground"
                : "text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            )}
          >
            <span className="font-mono text-[10px] opacity-70">
              {String(index + 1).padStart(2, "0")}
            </span>
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
