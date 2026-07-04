"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const NAV_LINKS = [
  { href: "/residential", label: "For Homeowners" },
  { href: "/commercial", label: "For Property Owners" },
  { href: "/counties", label: "Counties" },
  { href: "/login", label: "Sign in" },
];

export function SiteHeader() {
  const pathname = usePathname();

  return (
    <header className="border-b">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-8 py-[18px]">
        <Logo />
        <nav className="hidden items-center gap-7 md:flex">
          {NAV_LINKS.map((link) => {
            const active =
              link.href === "/counties"
                ? pathname.startsWith("/counties")
                : pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  "text-sm text-muted-foreground transition-colors hover:text-foreground",
                  active && "font-medium text-foreground"
                )}
              >
                {link.label}
              </Link>
            );
          })}
          <Button className="h-9 px-4" render={<Link href="/signup" />}>
            Get started
          </Button>
        </nav>
      </div>
    </header>
  );
}
