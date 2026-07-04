import Link from "next/link";
import { notFound } from "next/navigation";
import { getPool } from "@/lib/db";
import { getAppealWindowFromDb } from "@/lib/counties/data";
import { STEB_2026, appealWedgePct, countyFromSlug } from "@/lib/steb";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { StatCard } from "@/components/stat-card";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";

// On-demand ISR: rendering all 67 county pages at build time would exhaust
// the Supabase session pooler's connection limit, so pages render on first
// request and are cached for a day.
export const revalidate = 86400;
export const dynamicParams = true;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ county: string }>;
}) {
  const { county: slug } = await params;
  const county = countyFromSlug(slug);
  if (!county) return {};
  const steb = STEB_2026[county];
  const wedge = appealWedgePct(steb);
  return {
    title: `${county} County property tax appeals`,
    description:
      wedge != null
        ? `${county} County assesses property at ${steb.clr.toFixed(2)}% of market value (2026 CLR). See if your assessment is above the ratio and what an appeal could save.`
        : `${county} County property assessment appeal information: Common Level Ratio, deadlines, and how appeals work.`,
  };
}

export default async function CountyLandingPage({
  params,
}: {
  params: Promise<{ county: string }>;
}) {
  const { county: slug } = await params;
  const county = countyFromSlug(slug);
  if (!county) notFound();

  const steb = STEB_2026[county];
  const wedge = appealWedgePct(steb);

  const pool = getPool();
  const [{ rows: statusRows }, window] = await Promise.all([
    pool.query<{
      onboarded: boolean;
      has_parcel_data: boolean;
      notes: string | null;
    }>(
      `select onboarded_at is not null as onboarded, has_parcel_data, notes
       from county_data_status where county = $1`,
      [county]
    ),
    getAppealWindowFromDb(county),
  ]);
  const status = statusRows[0];
  const isLive = status?.onboarded ?? false;

  let parcelCount = 0;
  let overassessedShare: number | null = null;
  if (isLive) {
    // "Recently sold" is relative to the county's data snapshot (some free
    // datasets are a few years old), so old sale prices don't overstate the
    // overassessed share.
    const { rows } = await pool.query<{ n: number; sold: number; over: number }>(
      `with latest as (
         select max(s.sale_date) - interval '3 years' as cutoff
         from sales s join parcels p on p.parid = s.parid
         where p.county = $1 and s.is_valid_sale
       )
       select count(*)::int as n,
              count(*) filter (
                where s.sale_price >= 10000
                  and s.sale_date >= (select cutoff from latest)
              )::int as sold,
              count(*) filter (
                where s.sale_price >= 10000
                  and s.sale_date >= (select cutoff from latest)
                  and p.county_total > s.sale_price * (select ratio from common_level_ratio
                                                       where county = $1 order by tax_year desc limit 1)
              )::int as over
       from parcels p
       left join lateral (
         select sale_price, sale_date from sales
         where parid = p.parid and is_valid_sale
         order by sale_date desc limit 1
       ) s on true
       where p.county = $1`,
      [county]
    );
    parcelCount = rows[0]?.n ?? 0;
    if (rows[0] && rows[0].sold > 500) {
      overassessedShare = rows[0].over / rows[0].sold;
    }
  }

  const example = 300_000;
  const impliedAssessed = Math.round((example * steb.clr) / 100);

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />

      <main className="mx-auto w-full max-w-4xl flex-1 px-8 py-16">
        <div className="flex flex-wrap items-center gap-3">
          <p className="font-mono text-xs tracking-widest text-muted-foreground uppercase">
            Property tax appeals
          </p>
          {isLive ? (
            <Badge>Live on Equarra</Badge>
          ) : (
            <Badge variant="secondary">Coming soon</Badge>
          )}
        </div>
        <h1 className="mt-4 font-serif text-[46px] leading-tight tracking-[-0.01em]">
          {county} County, Pennsylvania
        </h1>
        {wedge != null ? (
          <p className="mt-3 max-w-2xl text-muted-foreground">
            {county} County&apos;s 2026 Common Level Ratio is{" "}
            <strong className="text-foreground">{steb.clr.toFixed(2)}%</strong> —
            on average, assessments sit ~{wedge.toFixed(0)}% below current market
            value. A property assessed <em>above</em> that ratio is carrying more
            than its share of the tax burden, and an appeal can reset it.
          </p>
        ) : (
          <p className="mt-3 max-w-2xl text-muted-foreground">
            {county} County{" "}
            {steb.reassessTo100
              ? "recently reassessed to full market value, so the Common Level Ratio no longer creates a broad appeal opportunity"
              : "has a predetermined ratio below 100%, so the raw Common Level Ratio overstates the typical appeal opportunity"}
            . Individual properties can still be overassessed relative to market
            value.
          </p>
        )}

        <div className="mt-8 grid gap-3 sm:grid-cols-3">
          <StatCard
            label="Common Level Ratio (2026)"
            value={`${steb.clr.toFixed(2)}%`}
            hint="State Tax Equalization Board"
          />
          <StatCard
            label="Filing deadline"
            value={window ? window.filingDeadline : "—"}
            hint={window ? `tax year ${window.taxYear}` : "not yet published here"}
          />
          <StatCard
            label={isLive ? "Parcels analyzed" : "Assessment gap"}
            value={
              isLive
                ? parcelCount.toLocaleString()
                : wedge != null
                  ? `~${wedge.toFixed(0)}%`
                  : "—"
            }
            hint={
              isLive
                ? overassessedShare != null
                  ? `~${Math.round(overassessedShare * 100)}% of recently sold parcels assessed above the CLR standard`
                  : "county assessment roll"
                : "county-wide average, not your property"
            }
          />
        </div>

        {window && (
          <Card className="mt-8">
            <CardContent className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
              <span className="flex items-center gap-2 font-medium">
                {window.boardName}
              </span>
              <span className="text-muted-foreground">
                {window.openDate ? `Filings open ${window.openDate} — ` : ""}
                due {window.filingDeadline} for tax year {window.taxYear}
              </span>
              {window.portalUrl && (
                <a
                  href={window.portalUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium underline underline-offset-2"
                >
                  County appeal forms
                </a>
              )}
            </CardContent>
          </Card>
        )}

        <h2 className="mt-12 font-serif text-2xl tracking-tight">
          How the math works
        </h2>
        <p className="mt-3 max-w-2xl text-sm text-muted-foreground">
          Pennsylvania appeals hinge on the Common Level Ratio: prove your
          property&apos;s market value, and the board must assess it at market
          value &times; CLR. In {county} County, a property worth{" "}
          ${example.toLocaleString()} should be assessed at about{" "}
          <strong className="text-foreground">
            ${impliedAssessed.toLocaleString()}
          </strong>
          . If yours is assessed higher than market value &times;{" "}
          {steb.clr.toFixed(2)}%, the difference is what an appeal can remove.
        </p>

        <div className="mt-10">
          {isLive ? (
            <>
              <h2 className="font-serif text-2xl tracking-tight">
                Check your property — free
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">
                {`Search ${county} County's assessment roll by address or parcel ID to get an instant savings score.`}
              </p>
              <form action="/score" method="GET" className="mt-4 flex max-w-xl gap-2">
                <Input
                  name="q"
                  placeholder="Street address or parcel ID"
                  className="h-11 bg-card text-base"
                />
                <Button type="submit" size="lg" className="h-11">
                  Search
                  <span className="font-mono">→</span>
                </Button>
              </form>
            </>
          ) : (
            <>
              <h2 className="font-serif text-2xl tracking-tight">
                Not live here yet
              </h2>
              <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
                We&apos;re rolling out county by county as free assessment data
                becomes available.{" "}
                {status?.has_parcel_data
                  ? `${county} County is on the roadmap.`
                  : `${county} County doesn't yet publish free parcel-level assessment data, which is what powers our instant scores.`}{" "}
                In the meantime, see the{" "}
                <Link href="/counties" className="underline underline-offset-2">
                  statewide map
                </Link>{" "}
                or check a property in a live county.
              </p>
              <Button render={<Link href="/counties" />} variant="outline" className="mt-4">
                View all counties
                <span className="font-mono">→</span>
              </Button>
            </>
          )}
        </div>

        <section className="mt-12 border-t pt-8">
          <h2 className="font-serif text-2xl tracking-tight">
            Choose the appeal path for your property
          </h2>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            {county} County&apos;s CLR sets the county-level rule. Equarra tailors
            the next step to how your property is used and what evidence supports
            the valuation.
          </p>
          <div className="mt-5 flex flex-col gap-3 sm:flex-row">
            <Button render={<Link href="/residential" />}>
              Check my home
              <span className="font-mono">→</span>
            </Button>
            <Button variant="outline" render={<Link href="/commercial" />}>
              Check my property
              <span className="font-mono">→</span>
            </Button>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
