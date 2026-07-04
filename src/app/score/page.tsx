import Link from "next/link";
import { ArrowRight, Building2, SearchX } from "lucide-react";
import { searchParcels } from "@/lib/parcels";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/empty-state";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";

export const metadata = { title: "Find your property" };

export default async function ScoreSearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  let results: Awaited<ReturnType<typeof searchParcels>> = [];
  let error: string | null = null;

  if (q && q.trim().length >= 3) {
    try {
      results = await searchParcels(q, 15);
    } catch {
      error = "Search is temporarily unavailable.";
    }
  }

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />

      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-12">
        <h1 className="font-heading text-3xl font-bold tracking-tight">
          Find your property
        </h1>
        <p className="mt-2 text-muted-foreground">
          Search by street address or 16-digit parcel ID to get a free savings
          score.
        </p>

        <form action="/score" method="GET" className="mt-6 flex gap-2">
          <Input
            name="q"
            defaultValue={q ?? ""}
            placeholder="Address or 16-digit parcel ID"
            className="h-11 bg-background text-base"
          />
          <Button type="submit" size="lg" className="h-11">
            Search
          </Button>
        </form>

        {error && (
          <p className="mt-6 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            {error}
          </p>
        )}
        {q && !error && results.length === 0 && (
          <EmptyState
            icon={SearchX}
            title={`No parcels matched \u201c${q}\u201d`}
            description="Try just the street number and name — e.g. “429 Forbes” instead of the full address."
            className="mt-8"
          />
        )}

        {results.length > 0 && (
          <>
            <p className="mt-8 text-sm text-muted-foreground">
              {results.length} {results.length === 1 ? "match" : "matches"}{" "}
              for &ldquo;{q}&rdquo;
            </p>
            <div className="mt-3 space-y-3">
              {results.map((p) => (
                <Card key={p.parid} className="transition-shadow hover:shadow-md">
                  <CardContent className="flex flex-wrap items-center justify-between gap-4">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                        <Building2 className="size-5" />
                      </span>
                      <div className="min-w-0">
                        <p className="truncate font-medium">{p.full_address}</p>
                        <p className="text-sm text-muted-foreground">
                          {p.muni_desc} · {p.class_desc ?? p.class} · Assessed{" "}
                          {p.county_total != null
                            ? `$${Number(p.county_total).toLocaleString()}`
                            : "—"}
                        </p>
                      </div>
                    </div>
                    <Button render={<Link href={`/score/${p.parid}`} />}>
                      Get savings score
                      <ArrowRight data-icon="inline-end" />
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          </>
        )}
      </main>

      <SiteFooter />
    </div>
  );
}
