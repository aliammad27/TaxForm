import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  CalendarClock,
  FileText,
  Gauge,
  MapPin,
  Scale,
  Search,
  Sparkles,
  TrendingDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { getLatestClr } from "@/lib/clr";

const STEPS = [
  {
    icon: Search,
    title: "Look up your property",
    description:
      "Search any Allegheny County address. We pull the county's own assessment record for your parcel instantly.",
  },
  {
    icon: Gauge,
    title: "Get your savings score",
    description:
      "Our comp engine values your home from recent comparable sales, applies the Common Level Ratio, and estimates what an appeal is worth.",
  },
  {
    icon: FileText,
    title: "File with confidence",
    description:
      "Create an account to generate an evidence-backed appeal letter, track deadlines, and file — yourself or with our full-service team.",
  },
];

const FEATURES = [
  {
    icon: Scale,
    title: "The county's own math",
    description:
      "Assessments are supposed to track the Common Level Ratio. When yours doesn't, that gap is your case — and we quantify it.",
  },
  {
    icon: Sparkles,
    title: "AI-built comparables",
    description:
      "Comparable sales pulled from county records and adjusted the way appraisers do it: time, size, condition, and location.",
  },
  {
    icon: TrendingDown,
    title: "Outcome predictions",
    description:
      "A model trained on historical BPAAR dispositions tells you the probability of a reduction before you file.",
  },
  {
    icon: FileText,
    title: "Evidence-backed letters",
    description:
      "One click produces a written submission grounded in your comps, the CLR calculation, and uploaded condition photos.",
  },
  {
    icon: CalendarClock,
    title: "Deadline tracking",
    description:
      "Filing windows, hearing dates, and document checklists in one dashboard, so nothing slips.",
  },
  {
    icon: BadgeCheck,
    title: "Free to check",
    description:
      "The savings score costs nothing and always will. Pay only if you want us to handle the appeal end to end.",
  },
];

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

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />

      <main className="flex-1">
        {/* Hero */}
        <section className="relative overflow-hidden border-b">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(60rem_30rem_at_50%_-10%,--alpha(var(--color-primary)/10%),transparent)]"
          />
          <div className="relative mx-auto flex w-full max-w-4xl flex-col items-center px-6 py-20 text-center sm:py-28">
            <p className="mb-6 inline-flex items-center gap-2 rounded-full border bg-background px-4 py-1.5 text-sm text-muted-foreground shadow-xs">
              <span className="inline-block size-2 rounded-full bg-success" />
              {taxYear} Common Level Ratio: {clrPct}% — the appeal window is
              open
            </p>
            <h1 className="max-w-3xl font-heading text-4xl font-bold tracking-tight text-balance sm:text-6xl">
              Is your Allegheny County property{" "}
              <span className="text-primary">over-assessed?</span>
            </h1>
            <p className="mt-5 max-w-xl text-lg text-pretty text-muted-foreground">
              Find out in 60 seconds — free. We analyze recent comparable sales
              and the county&apos;s own numbers to estimate your appeal
              savings.
            </p>

            <form
              action="/score"
              method="GET"
              className="mt-9 flex w-full max-w-xl flex-col gap-2 sm:flex-row"
            >
              <div className="relative flex-1">
                <MapPin className="pointer-events-none absolute top-1/2 left-3.5 size-4.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  name="q"
                  placeholder="Enter your property address"
                  className="h-12 bg-background pl-10 text-base shadow-sm"
                  required
                />
              </div>
              <Button type="submit" size="lg" className="h-12 px-5 text-base">
                Check my savings
                <ArrowRight data-icon="inline-end" />
              </Button>
            </form>
            <p className="mt-3 text-xs text-muted-foreground">
              No account needed. No credit card. Just county data.
            </p>
          </div>
        </section>

        {/* How it works */}
        <section className="mx-auto w-full max-w-6xl px-6 py-16 sm:py-20">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="font-heading text-3xl font-bold tracking-tight">
              How it works
            </h2>
            <p className="mt-3 text-muted-foreground">
              From address to filed appeal in three steps — the first two take
              about a minute.
            </p>
          </div>
          <div className="mt-10 grid gap-4 sm:grid-cols-3">
            {STEPS.map((step, i) => (
              <Card key={step.title} className="relative">
                <CardContent className="pt-2">
                  <div className="flex items-center gap-3">
                    <span className="flex size-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                      <step.icon className="size-5" />
                    </span>
                    <span className="font-mono text-sm text-muted-foreground">
                      Step {i + 1}
                    </span>
                  </div>
                  <h3 className="mt-4 font-heading text-lg font-semibold">
                    {step.title}
                  </h3>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {step.description}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        {/* Why the CLR matters */}
        <section className="border-y bg-muted/40">
          <div className="mx-auto grid w-full max-w-6xl gap-10 px-6 py-16 sm:py-20 lg:grid-cols-2 lg:items-center">
            <div>
              <h2 className="font-heading text-3xl font-bold tracking-tight">
                The {clrPct}% rule most owners don&apos;t know about
              </h2>
              <p className="mt-4 text-muted-foreground">
                Under the {taxYear} Common Level Ratio, your assessment should
                be about {clrPct}% of what your property would actually sell
                for. Many assessments sit far above that — which means owners
                quietly overpay every single year.
              </p>
              <p className="mt-3 text-muted-foreground">
                An appeal doesn&apos;t argue your home is worthless. It simply
                asks the county to apply its own ratio to a defensible market
                value. That&apos;s exactly the case we build for you.
              </p>
              <Button
                className="mt-6"
                size="lg"
                render={<Link href="/score" />}
              >
                Run my free savings score
                <ArrowRight data-icon="inline-end" />
              </Button>
            </div>
            <Card className="shadow-md">
              <CardContent className="space-y-4">
                <p className="text-sm font-medium text-muted-foreground">
                  Example: a home worth $300,000 on the market
                </p>
                <div className="space-y-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">
                      Fair assessment ({clrPct}% CLR)
                    </span>
                    <span className="font-mono font-semibold">
                      ${Math.round(300000 * (Number(clrPct) / 100)).toLocaleString()}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">
                      A typical over-assessment
                    </span>
                    <span className="font-mono font-semibold">$220,000</span>
                  </div>
                  <div className="flex items-center justify-between border-t pt-3">
                    <span className="font-medium">
                      Excess value an appeal can remove
                    </span>
                    <span className="font-mono font-bold text-primary">
                      $
                      {Math.round(
                        220000 - 300000 * (Number(clrPct) / 100)
                      ).toLocaleString()}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    At ~25 combined mills, that&apos;s roughly $
                    {Math.round(
                      (220000 - 300000 * (Number(clrPct) / 100)) * 0.025
                    ).toLocaleString()}{" "}
                    back in your pocket every year.
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </section>

        {/* Features */}
        <section className="mx-auto w-full max-w-6xl px-6 py-16 sm:py-20">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="font-heading text-3xl font-bold tracking-tight">
              Everything an appeal needs, in one place
            </h2>
            <p className="mt-3 text-muted-foreground">
              Built for homeowners doing it themselves and for commercial
              portfolios that need it handled.
            </p>
          </div>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <Card key={f.title}>
                <CardContent>
                  <span className="flex size-9 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                    <f.icon className="size-4.5" />
                  </span>
                  <h3 className="mt-3 font-heading font-semibold">{f.title}</h3>
                  <p className="mt-1.5 text-sm text-muted-foreground">
                    {f.description}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        {/* CTA band */}
        <section className="mx-auto w-full max-w-6xl px-6 pb-16 sm:pb-20">
          <div className="relative overflow-hidden rounded-2xl bg-primary px-6 py-12 text-center text-primary-foreground sm:py-16">
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 bg-[radial-gradient(40rem_20rem_at_50%_120%,--alpha(var(--color-primary-foreground)/12%),transparent)]"
            />
            <div className="relative">
              <h2 className="font-heading text-3xl font-bold tracking-tight">
                See what you could save this year
              </h2>
              <p className="mx-auto mt-3 max-w-md text-primary-foreground/80">
                The score is free, takes a minute, and uses the county&apos;s
                own data. There&apos;s nothing to lose except an inflated tax
                bill.
              </p>
              <Button
                size="lg"
                variant="secondary"
                className="mt-6 h-11 px-6 text-base"
                render={<Link href="/score" />}
              >
                Check my property
                <ArrowRight data-icon="inline-end" />
              </Button>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
