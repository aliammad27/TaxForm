import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { getPool } from "@/lib/db";
import { STEB_2026, appealWedgePct, countySlug } from "@/lib/steb";
import geo from "@/lib/pa-counties-geo.json";
import { Badge } from "@/components/ui/badge";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const revalidate = 86400;

export const metadata = {
  title: "Pennsylvania property overassessment map",
  description:
    "How far below market value is each PA county assessing property? County-by-county Common Level Ratios, appeal deadlines, and potential assessment reductions.",
};

/** Wedge percent -> fill color (light amber to deep red). */
function wedgeColor(wedge: number | null): string {
  if (wedge == null) return "#e4e4e7";
  const t = Math.min(1, Math.max(0, wedge / 100));
  const from = { r: 254, g: 230, b: 190 };
  const to = { r: 165, g: 36, b: 24 };
  const mix = (a: number, b: number) => Math.round(a + (b - a) * t);
  return `rgb(${mix(from.r, to.r)}, ${mix(from.g, to.g)}, ${mix(from.b, to.b)})`;
}

export default async function CountiesPage() {
  const { rows: statusRows } = await getPool().query<{
    county: string;
    onboarded: boolean;
  }>(
    `select county, onboarded_at is not null as onboarded from county_data_status`
  );
  const live = new Set(statusRows.filter((r) => r.onboarded).map((r) => r.county));

  const counties = Object.entries(STEB_2026)
    .map(([county, row]) => ({
      county,
      clr: row.clr,
      wedge: appealWedgePct(row),
      isLive: live.has(county),
    }))
    .sort((a, b) => (b.wedge ?? -1) - (a.wedge ?? -1));

  const byName = new Map(counties.map((c) => [c.county, c]));

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />

      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-14">
        <p className="font-mono text-xs tracking-widest text-muted-foreground uppercase">
          Statewide overassessment map
        </p>
        <h1 className="mt-3 font-serif text-4xl tracking-tight">
          Most Pennsylvania counties assess property far from market value
        </h1>
        <p className="mt-3 max-w-2xl text-muted-foreground">
          Each county&apos;s Common Level Ratio (CLR) — published annually by the
          State Tax Equalization Board — measures how far assessments sit below
          current market value. The bigger the gap, the bigger the potential
          reduction when a property is assessed above the ratio. TaxForm is live
          in {live.size} of 67 counties.
        </p>

        <div className="mt-10">
          <svg
            viewBox={`0 0 ${geo.width} ${geo.height}`}
            role="img"
            aria-label="Map of Pennsylvania counties shaded by assessment gap"
            className="w-full"
          >
            {geo.counties.map((c) => {
              const info = byName.get(c.name);
              const slug = countySlug(c.name);
              const label = info
                ? `${c.name} County — CLR ${info.clr.toFixed(2)}%` +
                  (info.wedge != null
                    ? `, assessed ~${info.wedge.toFixed(0)}% below market`
                    : "") +
                  (info.isLive ? " — live on TaxForm" : "")
                : `${c.name} County`;
              return (
                <Link key={c.name} href={`/counties/${slug}`}>
                  <path
                    d={c.path}
                    fill={wedgeColor(info?.wedge ?? null)}
                    stroke={info?.isLive ? "#1c1917" : "#ffffff"}
                    strokeWidth={info?.isLive ? 2.5 : 1}
                    className="transition-opacity hover:opacity-75"
                  >
                    <title>{label}</title>
                  </path>
                </Link>
              );
            })}
          </svg>
          <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-muted-foreground">
            <span className="flex items-center gap-2">
              <span className="inline-block h-3 w-10 rounded-sm bg-gradient-to-r from-[#feE6be] to-[#a52418]" />
              Assessment gap (small &rarr; large)
            </span>
            <span className="flex items-center gap-2">
              <span className="inline-block h-3 w-3 rounded-sm bg-[#e4e4e7]" />
              No reliable CLR wedge (recent reassessment or PDR below 100)
            </span>
            <span className="flex items-center gap-2">
              <span className="inline-block h-3 w-3 rounded-sm border-2 border-[#1c1917] bg-white" />
              Live on TaxForm
            </span>
          </div>
        </div>

        <h2 className="mt-14 font-serif text-2xl tracking-tight">
          All 67 counties, ranked by assessment gap
        </h2>
        <div className="mt-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>County</TableHead>
                <TableHead>CLR (2026)</TableHead>
                <TableHead>Assessed below market</TableHead>
                <TableHead>Status</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {counties.map((c) => (
                <TableRow key={c.county}>
                  <TableCell className="font-medium">{c.county}</TableCell>
                  <TableCell className="font-mono text-sm">
                    {c.clr.toFixed(2)}%
                  </TableCell>
                  <TableCell className="font-mono text-sm">
                    {c.wedge != null ? `~${c.wedge.toFixed(0)}%` : "—"}
                  </TableCell>
                  <TableCell>
                    {c.isLive ? (
                      <Badge>Live</Badge>
                    ) : c.wedge != null ? (
                      <Badge variant="secondary">Coming soon</Badge>
                    ) : (
                      <Badge variant="outline">Limited wedge</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <Link
                      href={`/counties/${countySlug(c.county)}`}
                      className="inline-flex items-center gap-1 text-sm font-medium underline-offset-2 hover:underline"
                    >
                      Details
                      <ArrowRight className="size-3.5" />
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <p className="mt-8 max-w-2xl text-xs text-muted-foreground">
          &ldquo;Assessed below market&rdquo; is 100% minus the county&apos;s
          2026 Common Level Ratio and describes county-wide averages, not any
          individual property. Counties marked with a dash recently reassessed
          to full market value or have a predetermined ratio below 100%, where
          the raw CLR overstates the appeal opportunity.
        </p>
      </main>

      <SiteFooter />
    </div>
  );
}
