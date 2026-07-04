import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { getLatestClr } from "@/lib/clr";

const STEPS = [
  {
    n: "01",
    title: "Look up your property",
    description:
      "Search any Allegheny County address. We pull the county's assessment record for your parcel instantly — no account needed.",
  },
  {
    n: "02",
    title: "Get your savings score",
    description:
      "Our comp engine values your property from recent comparable sales, applies the Common Level Ratio, and tells you what an appeal is worth — and how likely it is to win.",
  },
  {
    n: "03",
    title: "File with confidence",
    description:
      "Generate an evidence-backed appeal letter, track deadlines and hearings, and file — yourself, or with our full-service team handling everything.",
  },
];

const FEATURES: [string, string][] = [
  [
    "The county's own math",
    "Assessments are supposed to track the Common Level Ratio. When yours doesn't, that gap is your case — and we quantify it to the dollar.",
  ],
  [
    "Comparables, done properly",
    "Sales pulled from county records and adjusted the way appraisers do it: time, size, condition, location.",
  ],
  [
    "Outcome predictions",
    "A model trained on historical BPAAR dispositions estimates your probability of a reduction before you file.",
  ],
  [
    "Evidence-backed letters",
    "One click produces a written submission grounded in your comps, the CLR calculation, and uploaded condition photos.",
  ],
  [
    "Deadline tracking",
    "Filing windows, hearing dates, and document checklists in one place, so nothing slips.",
  ],
  [
    "Free to check",
    "The savings score costs nothing and always will. Pay only if you want the appeal handled end to end.",
  ],
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
          <div className="mx-auto grid w-full max-w-6xl gap-12 px-6 py-16 sm:py-24 lg:grid-cols-[1.2fr_1fr] lg:items-center">
            <div>
              <p className="font-mono text-xs tracking-widest text-muted-foreground uppercase">
                Allegheny County · Tax year {taxYear}
              </p>
              <h1 className="mt-5 font-serif text-5xl leading-[1.05] tracking-tight text-balance sm:text-6xl">
                You might be paying taxes on a house{" "}
                <em className="text-primary">that doesn&apos;t exist.</em>
              </h1>
              <p className="mt-6 max-w-md text-lg text-muted-foreground">
                If your assessment is above {clrPct}% of market value, the
                county is taxing value your property doesn&apos;t have. Takes a
                minute to check. Costs nothing.
              </p>

              <form
                action="/score"
                method="GET"
                className="mt-8 flex w-full max-w-md flex-col gap-2 sm:flex-row"
              >
                <Input
                  name="q"
                  placeholder="429 Forbes Ave"
                  className="h-11 flex-1 bg-card text-base"
                  required
                />
                <Button type="submit" size="lg" className="h-11 px-5">
                  Check my address
                  <ArrowRight data-icon="inline-end" />
                </Button>
              </form>
              <p className="mt-3 font-mono text-xs text-muted-foreground">
                No account. No credit card. County data only.
              </p>
            </div>

            {/* Worked example, receipt-style */}
            <div className="border bg-card">
              <div className="border-b px-5 py-3">
                <p className="font-mono text-xs tracking-widest text-muted-foreground uppercase">
                  Worked example
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
                  mills (estimate — actual millage varies by municipality),
                  every year until reassessment
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* How it works */}
        <section className="mx-auto w-full max-w-6xl px-6 py-16 sm:py-24">
          <div className="grid gap-10 lg:grid-cols-[1fr_2fr]">
            <div>
              <p className="font-mono text-xs tracking-widest text-muted-foreground uppercase">
                How it works
              </p>
              <h2 className="mt-4 font-serif text-3xl tracking-tight sm:text-4xl">
                Three steps. The first two take a minute.
              </h2>
            </div>
            <ol>
              {STEPS.map((step) => (
                <li
                  key={step.n}
                  className="grid gap-3 border-t py-6 first:border-t-0 first:pt-0 sm:grid-cols-[4rem_1fr] sm:gap-6"
                >
                  <span className="font-mono text-sm text-muted-foreground">
                    {step.n}
                  </span>
                  <div>
                    <h3 className="text-lg font-medium">{step.title}</h3>
                    <p className="mt-1.5 max-w-lg text-muted-foreground">
                      {step.description}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* CLR argument */}
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
                for. Many sit far above that — and those owners quietly overpay
                every single year.
              </p>
              <p className="text-muted-foreground">
                That gap is the entire case. We find it in the county&apos;s
                own sales records, put a dollar figure on it, and build the
                evidence an appeal board expects to see.
              </p>
            </div>
            <Button className="mt-8" size="lg" render={<Link href="/score" />}>
              Run my free savings score
              <ArrowRight data-icon="inline-end" />
            </Button>
          </div>
        </section>

        {/* Features */}
        <section className="mx-auto w-full max-w-6xl px-6 py-16 sm:py-24">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <h2 className="font-serif text-3xl tracking-tight sm:text-4xl">
              Everything an appeal needs
            </h2>
            <p className="max-w-sm text-sm text-muted-foreground">
              For homeowners doing it themselves, and commercial portfolios
              that need it handled.
            </p>
          </div>
          <dl className="mt-10 grid gap-x-12 sm:grid-cols-2">
            {FEATURES.map(([title, description]) => (
              <div key={title} className="border-t py-5">
                <dt className="font-medium">{title}</dt>
                <dd className="mt-1.5 text-sm text-muted-foreground">
                  {description}
                </dd>
              </div>
            ))}
          </dl>
        </section>

        {/* Closing CTA */}
        <section className="border-t">
          <div className="mx-auto flex w-full max-w-6xl flex-col items-start gap-6 px-6 py-16 sm:py-20">
            <h2 className="max-w-2xl font-serif text-4xl leading-tight tracking-tight sm:text-5xl">
              The county won&apos;t call you about this.{" "}
              <em className="text-primary">Check anyway.</em>
            </h2>
            <Button size="lg" className="h-11 px-6" render={<Link href="/score" />}>
              Check my property
              <ArrowRight data-icon="inline-end" />
            </Button>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
