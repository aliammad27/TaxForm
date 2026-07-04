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
  title: "Pennsylvania homeowner property tax appeals",
  description:
    "Check whether your Pennsylvania home is overassessed, generate an appeal letter, and decide whether to file yourself or use full-service help.",
};

const FEATURES = [
  "Free savings score before you create an account",
  "Comparable sales adjusted for size, age, baths, and condition",
  "Condition-photo evidence that can strengthen your appeal letter",
  "Deadline tracking and a DIY filing checklist",
];

export default async function ResidentialPage() {
  let clrPct = "50.14";
  try {
    const clr = await getLatestClr();
    clrPct = (clr.ratio * 100).toFixed(2);
  } catch {
    // DB may be unavailable during local setup; keep the page renderable.
  }

  const marketValue = 325_000;
  const fairAssessment = Math.round(marketValue * (Number(clrPct) / 100));
  const countyAssessment = 230_000;
  const excess = countyAssessment - fairAssessment;
  const annualSavings = Math.round(excess * 0.025);

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />

      <main className="flex-1">
        <section className="border-b">
          <div className="mx-auto grid w-full max-w-6xl gap-12 px-6 py-16 sm:py-24 lg:grid-cols-[1.15fr_0.85fr] lg:items-center">
            <div>
              <p className="font-mono text-xs tracking-widest text-muted-foreground uppercase">
                For homeowners
              </p>
              <h1 className="mt-5 font-serif text-5xl leading-[1.05] tracking-tight text-balance sm:text-6xl">
                Find out if your home is carrying{" "}
                <em className="text-primary">too much</em> tax burden.
              </h1>
              <p className="mt-6 max-w-lg text-lg text-muted-foreground">
                Equarra checks your home against recent comparable sales, applies
                Pennsylvania&apos;s Common Level Ratio, and shows whether a DIY appeal
                is worth filing.
              </p>
              <AddressSearchForm
                className="mt-8"
                buttonLabel="Check my home"
                placeholder="429 Forbes Ave"
                helperText="Free score first. Appeal letter when you are ready."
              />
            </div>

            <Card className="shadow-[0_1px_2px_oklch(0.23_0.012_120_/_0.04),0_12px_32px_-16px_oklch(0.23_0.012_120_/_0.12)]">
              <CardHeader>
                <CardTitle>Single-family example</CardTitle>
                <CardDescription>
                  How the CLR turns a market-value gap into an assessment reduction.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-0 text-sm">
                <div className="flex justify-between gap-4 py-2">
                  <span className="text-muted-foreground">Comp-supported value</span>
                  <span className="font-mono">${marketValue.toLocaleString()}</span>
                </div>
                <div className="flex justify-between gap-4 border-t border-dashed py-2">
                  <span className="text-muted-foreground">
                    Fair assessment at {clrPct}% CLR
                  </span>
                  <span className="font-mono">${fairAssessment.toLocaleString()}</span>
                </div>
                <div className="flex justify-between gap-4 border-t border-dashed py-2">
                  <span className="text-muted-foreground">Current assessment</span>
                  <span className="font-mono">${countyAssessment.toLocaleString()}</span>
                </div>
                <div className="flex justify-between gap-4 border-t py-2.5">
                  <span className="font-medium">Appealable overassessment</span>
                  <span className="font-mono font-semibold text-primary">
                    ${excess.toLocaleString()}
                  </span>
                </div>
                <p className="border-t pt-3 text-xs text-muted-foreground">
                  At an assumed 25 mills, that is roughly ${annualSavings.toLocaleString()}
                  /yr until reassessment. Actual millage varies by municipality.
                </p>
              </CardContent>
            </Card>
          </div>
        </section>

        <section className="mx-auto grid w-full max-w-6xl gap-10 px-6 py-16 sm:py-24 lg:grid-cols-[0.8fr_1.2fr]">
          <div>
            <p className="font-mono text-xs tracking-widest text-muted-foreground uppercase">
              01 — Homeowner appeal kit
            </p>
            <h2 className="mt-4 font-serif text-3xl tracking-tight sm:text-4xl">
              The useful parts of an appeal, without the legal fog.
            </h2>
          </div>
          <dl className="grid gap-x-10 sm:grid-cols-2">
            {FEATURES.map((feature) => (
              <div key={feature} className="border-t py-5">
                <dt className="font-medium">{feature}</dt>
                <dd className="mt-1.5 text-sm text-muted-foreground">
                  Built from county data and your uploaded evidence, then turned into
                  a practical filing package.
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
              Start free. Choose how much help you want.
            </h2>
            <div className="mt-8 grid gap-4 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>DIY appeal</CardTitle>
                  <CardDescription>
                    For homeowners who want the score, evidence, and letter.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="font-serif text-4xl">$0</p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Free score and account. Pay only for optional add-ons as they become
                    available.
                  </p>
                  <Button
                    className="mt-5"
                    render={<Link href="/signup?path=residential" />}
                  >
                    Create DIY account
                    <span className="font-mono">→</span>
                  </Button>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>Full-Service</CardTitle>
                  <CardDescription>
                    For homeowners who want Equarra to handle the appeal process.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="font-serif text-4xl">Handled for you</p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    We prepare the filing package, track deadlines, and guide the case
                    through the county process.
                  </p>
                  <Button
                    variant="outline"
                    className="mt-5"
                    render={<Link href="/signup?path=residential&tier=full_service" />}
                  >
                    Request full-service help
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
