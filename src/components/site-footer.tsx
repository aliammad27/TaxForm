import { Logo } from "@/components/logo";

export function SiteFooter() {
  return (
    <footer className="border-t">
      <div className="mx-auto w-full max-w-6xl px-6 py-10">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <Logo />
            <p className="mt-2 max-w-xs text-sm text-muted-foreground">
              Property tax appeals for Allegheny County, built on the
              county&apos;s own data.
            </p>
          </div>
          <p className="font-mono text-xs leading-relaxed text-muted-foreground sm:max-w-sm sm:text-right">
            TaxForm is not a law firm. Savings estimates are informational,
            not a guarantee of appeal outcomes.
          </p>
        </div>
      </div>
    </footer>
  );
}
