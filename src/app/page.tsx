import Link from "next/link";
import { ArrowRight } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { getLatestClr } from "@/lib/clr";

export const metadata = {
  title: "Pennsylvania property tax appeal analysis",
  description:
    "Equarra helps Pennsylvania homeowners and commercial property owners identify assessment overpayments using Common Level Ratio math and county data.",
};

export default async function LandingPage() {
  let clrPct = "50.14";
  let taxYear = 2026;
  try {
    const clr = await getLatestClr();
    clrPct = (clr.ratio * 100).toFixed(2);
    taxYear = clr.tax_year;
  } catch {
    // DB not seeded yet; show defaults
  }

  const clrRatio = Number(clrPct) / 100;
  const fairAssessment = Math.round(300000 * clrRatio);
  const excess = 220000 - fairAssessment;
  const annualSavings = Math.round(excess * 0.025);

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />

      <main className="flex-1">
        {/* Hero */}
        <section className="border-b">
          <div className="mx-auto grid w-full max-w-6xl gap-12 px-6 py-16 sm:py-24 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
            <div>
              <p className="font-mono text-xs tracking-widest text-muted-foreground uppercase">
                Pennsylvania property tax appeals · Tax year {taxYear}
              </p>
              <h1 className="mt-5 font-serif text-5xl leading-[1.05] tracking-tight text-balance sm:text-6xl">
                Your assessment is supposed to follow the county&apos;s own ratio.
              </h1>
              <p className="mt-6 max-w-md text-lg text-muted-foreground">
                If your assessment is above {clrPct}% of market value, the
                county is taxing value your property doesn&apos;t have. Equarra
                finds that gap for homeowners and commercial property owners.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Button size="lg" render={<Link href="/residential" />}>
                  For Homeowners
                  <ArrowRight data-icon="inline-end" />
                </Button>
                <Button size="lg" variant="outline" render={<Link href="/commercial" />}>
                  For Property Owners
                  <ArrowRight data-icon="inline-end" />
                </Button>
              </div>
            </div>

            <div className="border bg-card">
              <div className="border-b px-5 py-3">
                <p className="font-mono text-xs tracking-widest text-muted-foreground uppercase">
                  CLR wedge example
                </p>
              </div>
              <div className="space-y-0 px-5 py-4 text-sm">
                <div className="flex items-baseline justify-between py-2">
                  <span className="text-muted-foreground">
                    Market value (from comps)
                  </span>
                  <span className="font-mono">$300,000</span>
                </div>
                <div className="flex items-baseline justify-between border-t border-dashed py-2">
                  <span className="text-muted-foreground">
                    Fair assessment at {clrPct}% CLR
                  </span>
                  <span className="font-mono">
                    ${fairAssessment.toLocaleString()}
                  </span>
                </div>
                <div className="flex items-baseline justify-between border-t border-dashed py-2">
                  <span className="text-muted-foreground">
                    What the county assessed
                  </span>
                  <span className="font-mono">$220,000</span>
                </div>
                <div className="flex items-baseline justify-between border-t py-2.5">
                  <span className="font-medium">Phantom value being taxed</span>
                  <span className="font-mono font-semibold text-primary">
                    ${excess.toLocaleString()}
                  </span>
                </div>
              </div>
              <div className="border-t bg-muted/50 px-5 py-3">
                <p className="font-mono text-xs text-muted-foreground">
                  ≈ ${annualSavings.toLocaleString()}/yr back at an assumed 25
                  mills (estimate; actual millage varies by municipality),
                  every year until reassessment
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="mx-auto w-full max-w-6xl px-6 py-16 sm:py-24">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="font-mono text-xs tracking-widest text-muted-foreground uppercase">
                Choose your path
              </p>
              <h2 className="mt-4 font-serif text-3xl tracking-tight sm:text-4xl">
                Same CLR math. Different evidence.
              </h2>
            </div>
            <Link
              href="/counties"
              className="text-sm font-medium underline underline-offset-4"
            >
              See county-level assessment gaps
            </Link>
          </div>
          <div className="mt-8 grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Residential</CardTitle>
                <CardDescription>
                  For homeowners checking a house, condo, or small residential
                  property.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Start with a free score, then generate a DIY appeal letter with
                  comparable sales, CLR math, and condition-photo evidence.
                </p>
                <Button className="mt-5" render={<Link href="/residential" />}>
                  Check my home
                  <ArrowRight data-icon="inline-end" />
                </Button>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Commercial</CardTitle>
                <CardDescription>
                  For property owners evaluating income-producing assets and
                  portfolios.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Layer commercial comparable sales with rent rolls, T-12s, income
                  approach support, and portfolio prioritization.
                </p>
                <Button
                  className="mt-5"
                  variant="outline"
                  render={<Link href="/commercial" />}
                >
                  Check my property
                  <ArrowRight data-icon="inline-end" />
                </Button>
              </CardContent>
            </Card>
          </div>
        </section>

        <section className="border-y bg-card">
          <div className="mx-auto w-full max-w-6xl px-6 py-16 sm:py-24">
            <p className="font-mono text-xs tracking-widest text-muted-foreground uppercase">
              Why this works
            </p>
            <blockquote className="mt-6 max-w-3xl font-serif text-3xl leading-snug tracking-tight sm:text-4xl">
              An appeal doesn&apos;t argue your home is worthless. It asks the
              county to apply <em className="text-primary">its own ratio</em>{" "}
              to a defensible market value.
            </blockquote>
            <div className="mt-8 grid max-w-3xl gap-6 sm:grid-cols-2">
              <p className="text-muted-foreground">
                Under the {taxYear} Common Level Ratio, your assessment should
                be about {clrPct}% of what your property would actually sell
                for. Many sit far above that, and those owners quietly overpay
                every single year.
              </p>
              <p className="text-muted-foreground">
                That gap is the entire case. We find it in the county&apos;s
                own sales records, put a dollar figure on it, and build the
                evidence an appeal board expects to see.
              </p>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
