import Link from "next/link";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";

export function SiteHeader() {
  return (
    <header className="border-b">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-4">
        <Logo />
        <nav className="flex items-center gap-5">
          <Link
            href="/residential"
            className="text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            For Homeowners
          </Link>
          <Link
            href="/commercial"
            className="text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            For Property Owners
          </Link>
          <Link
            href="/counties"
            className="text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            Counties
          </Link>
          <Link
            href="/login"
            className="text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            Sign in
          </Link>
          <Button render={<Link href="/signup" />}>Get started</Button>
        </nav>
      </div>
    </header>
  );
}
