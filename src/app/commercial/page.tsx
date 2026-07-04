import Link from "next/link";
import { AddressSearchForm } from "@/components/address-search-form";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getLatestClr } from "@/lib/clr";

export const metadata = {
  title: "Pennsylvania commercial property tax appeals",
  description:
    "Commercial property tax appeal analysis for Pennsylvania owners using comparable sales, rent rolls, T-12s, income approach, and portfolio analytics.",
};

const FEATURES = [
  [
    "Income approach support",
    "Upload T-12s and rent rolls so NOI and cap-rate indications can sit beside the comparable-sales estimate.",
  ],
  [
    "Portfolio analytics",
    "Track multiple parcels, prioritize the largest tax leakage, and coordinate filings across counties.",
  ],
  [
    "Commercial comp logic",
    "Commercial parcels use area-scaled sale adjustments instead of homeowner bed/bath heuristics.",
  ],
  [
    "Owner-ready evidence",
    "Keep sales comps, assessment math, and operating-statement support in one appeal workspace.",
  ],
];

export default async function CommercialPage() {
  let clrPct = "50.14";
  try {
    const clr = await getLatestClr();
    clrPct = (clr.ratio * 100).toFixed(2);
  } catch {
    // DB may be unavailable during local setup; keep the page renderable.
  }

  const compValue = 4_800_000;
  const incomeValue = 4_250_000;
  const selectedValue = Math.min(compValue, incomeValue);
  const fairAssessment = Math.round(selectedValue * (Number(clrPct) / 100));
  const currentAssessment = 2_700_000;
  const reduction = currentAssessment - fairAssessment;
  const annualSavings = Math.round(reduction * 0.025);

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />

      <main className="flex-1">
        <section className="border-b">
          <div className="mx-auto grid w-full max-w-6xl gap-12 px-6 py-16 sm:py-24 lg:grid-cols-[1.15fr_0.85fr] lg:items-center">
            <div>
              <p className="font-mono text-xs tracking-widest text-muted-foreground uppercase">
                For property owners
              </p>
              <h1 className="mt-5 font-serif text-5xl leading-[1.05] tracking-tight text-balance sm:text-6xl">
                Commercial appeals need both comps{" "}
                <em className="text-primary">and</em> operating reality.
              </h1>
              <p className="mt-6 max-w-lg text-lg text-muted-foreground">
                Equarra combines Pennsylvania CLR math with commercial comparable
                sales, rent rolls, T-12s, and portfolio tracking so owners can
                prioritize the largest assessment leaks.
              </p>
              <AddressSearchForm
                className="mt-8"
                buttonLabel="Check my property"
                placeholder="Commercial address or parcel ID"
                helperText="Start with a free parcel score, then add operating data."
              />
            </div>

            <Card className="shadow-[0_1px_2px_oklch(0.23_0.012_120_/_0.04),0_12px_32px_-16px_oklch(0.23_0.012_120_/_0.12)]">
              <CardHeader>
                <CardTitle>Multifamily example</CardTitle>
                <CardDescription>
                  Commercial cases can compare sales value against income value.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-0 text-sm">
                <div className="flex justify-between gap-4 py-2">
                  <span className="text-muted-foreground">Sales-comparison value</span>
                  <span className="font-mono">${compValue.toLocaleString()}</span>
                </div>
                <div className="flex justify-between gap-4 border-t border-dashed py-2">
                  <span className="text-muted-foreground">Income-approach value</span>
                  <span className="font-mono">${incomeValue.toLocaleString()}</span>
                </div>
                <div className="flex justify-between gap-4 border-t border-dashed py-2">
                  <span className="text-muted-foreground">
                    Fair assessment at {clrPct}% CLR
                  </span>
                  <span className="font-mono">${fairAssessment.toLocaleString()}</span>
                </div>
                <div className="flex justify-between gap-4 border-t border-dashed py-2">
                  <span className="text-muted-foreground">Current assessment</span>
                  <span className="font-mono">
                    ${currentAssessment.toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between gap-4 border-t py-2.5">
                  <span className="font-medium">Appealable overassessment</span>
                  <span className="font-mono font-semibold text-primary">
                    ${reduction.toLocaleString()}
                  </span>
                </div>
                <p className="border-t pt-3 text-xs text-muted-foreground">
                  At an assumed 25 mills, that is roughly ${annualSavings.toLocaleString()}
                  /yr. Actual millage and cap-rate support vary by property.
                </p>
              </CardContent>
            </Card>
          </div>
        </section>

        <section className="mx-auto w-full max-w-6xl px-6 py-16 sm:py-24">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="font-mono text-xs tracking-widest text-muted-foreground uppercase">
                01 — Commercial workflow
              </p>
              <h2 className="mt-4 font-serif text-3xl tracking-tight sm:text-4xl">
                Built for owners with operating statements and multiple parcels.
              </h2>
            </div>
            <Button render={<Link href="/signup?path=commercial" />}>
              Start commercial review
              <span className="font-mono">→</span>
            </Button>
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

        <section className="border-y bg-card">
          <div className="mx-auto w-full max-w-6xl px-6 py-16 sm:py-24">
            <p className="font-mono text-xs tracking-widest text-muted-foreground uppercase">
              02 — Pricing
            </p>
            <h2 className="mt-4 font-serif text-3xl tracking-tight sm:text-4xl">
              Choose contingency or full-service support.
            </h2>
            <div className="mt-8 grid gap-4 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Contingency</CardTitle>
                  <CardDescription>
                    For owners who want appeal work aligned with tax savings.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="font-serif text-4xl">Success-based</p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Upload property data, prioritize opportunities, and move viable
                    cases into an owner-approved appeal workflow.
                  </p>
                  <Button
                    className="mt-5"
                    render={<Link href="/signup?path=commercial" />}
                  >
                    Create commercial account
                    <span className="font-mono">→</span>
                  </Button>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>Full-Service</CardTitle>
                  <CardDescription>
                    For portfolios that want filings and coordination handled.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="font-serif text-4xl">Managed process</p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Equarra coordinates evidence, deadlines, filings, and status
                    tracking across eligible commercial parcels.
                  </p>
                  <Button
                    variant="outline"
                    className="mt-5"
                    render={<Link href="/signup?path=commercial&tier=full_service" />}
                  >
                    Request full-service review
                    <span className="font-mono">→</span>
                  </Button>
                </CardContent>
              </Card>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
