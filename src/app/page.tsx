import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { getLatestClr } from "@/lib/clr";

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
    <main className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between border-b px-6 py-4">
        <span className="text-lg font-bold tracking-tight">TaxForm</span>
        <nav className="flex items-center gap-3">
          <Button variant="ghost" render={<Link href="/login" />}>
            Sign in
          </Button>
          <Button render={<Link href="/signup" />}>Get started</Button>
        </nav>
      </header>

      <section className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center px-6 py-20 text-center">
        <p className="mb-4 rounded-full border px-4 py-1 text-sm text-muted-foreground">
          {taxYear} Common Level Ratio: {clrPct}% — the appeal window is wide open
        </p>
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
          Is your Allegheny County property over-assessed?
        </h1>
        <p className="mt-4 max-w-xl text-lg text-muted-foreground">
          Find out in 60 seconds — free. We analyze recent comparable sales and
          the county&apos;s own numbers to estimate your appeal savings.
        </p>

        <form action="/score" method="GET" className="mt-8 flex w-full max-w-xl gap-2">
          <Input
            name="q"
            placeholder="Enter your property address"
            className="h-12 text-base"
            required
          />
          <Button type="submit" size="lg" className="h-12">
            Check my savings
          </Button>
        </form>

        <div className="mt-16 grid w-full gap-4 text-left sm:grid-cols-3">
          <Card>
            <CardContent className="pt-6">
              <p className="text-2xl font-bold">{clrPct}%</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Assessed values should be about half of market value under the{" "}
                {taxYear} CLR. Many are far higher.
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <p className="text-2xl font-bold">AI-built comps</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Comparable sales pulled from county records and adjusted the way
                appraisers do it.
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <p className="text-2xl font-bold">Free forever</p>
              <p className="mt-1 text-sm text-muted-foreground">
                The savings score costs nothing. Pay only if you want us to
                handle the appeal.
              </p>
            </CardContent>
          </Card>
        </div>
      </section>

      <footer className="border-t px-6 py-4 text-center text-sm text-muted-foreground">
        TaxForm is not a law firm. Savings estimates are informational, not a
        guarantee of appeal outcomes.
      </footer>
    </main>
  );
}
