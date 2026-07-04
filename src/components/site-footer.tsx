import { Logo } from "@/components/logo";

export function SiteFooter() {
  return (
    <footer className="border-t border-[oklch(0.32_0.04_155)] bg-[oklch(0.24_0.038_155)] text-[oklch(0.85_0.015_110)]">
      <div className="mx-auto w-full max-w-6xl px-8 py-12">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <Logo className="text-[24px] text-[oklch(0.955_0.008_95)] [&_span]:text-[oklch(0.72_0.09_140)]" />
            <p className="mt-2.5 max-w-xs text-[13.5px] leading-relaxed">
              Property tax appeals across Pennsylvania, built on the
              counties&apos; own data.
            </p>
          </div>
          <p className="font-mono text-[11.5px] leading-relaxed text-[oklch(0.68_0.02_120)] sm:max-w-sm sm:text-right">
            Equarra is not a law firm. Savings estimates are informational,
            not a guarantee of appeal outcomes.
          </p>
        </div>
      </div>
    </footer>
  );
}
