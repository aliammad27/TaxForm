import Link from "next/link";
import { searchParcels } from "@/lib/parcels";
import { Button } from "@/components/ui/button";
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

      <main className="mx-auto w-full max-w-3xl flex-1 px-8 py-16">
        <p className="font-mono text-xs tracking-widest text-muted-foreground uppercase">
          Free savings score
        </p>
        <h1 className="mt-4 font-serif text-[46px] leading-tight tracking-[-0.01em]">
          Find your property
        </h1>
        <p className="mt-3 text-muted-foreground">
          Search by street address or 16-digit parcel ID.
        </p>

        <form action="/score" method="GET" className="mt-6 flex gap-2">
          <Input
            name="q"
            defaultValue={q ?? ""}
            placeholder="Address or 16-digit parcel ID"
            className="h-11 bg-card text-base"
          />
          <Button type="submit" size="lg" className="h-11">
            Search
          </Button>
        </form>

        {error && (
          <p className="mt-6 border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            {error}
          </p>
        )}
        {q && !error && results.length === 0 && (
          <EmptyState
            title={`No parcels matched \u201c${q}\u201d`}
            description="Try just the street number and name — e.g. “429 Forbes” instead of the full address."
            className="mt-8"
          />
        )}

        {results.length > 0 && (
          <>
            <p className="mt-10 font-mono text-xs tracking-widest text-muted-foreground uppercase">
              {results.length} {results.length === 1 ? "match" : "matches"} for
              &ldquo;{q}&rdquo;
            </p>
            <ul className="mt-3 border-t">
              {results.map((p) => (
                <li
                  key={p.parid}
                  className="flex flex-wrap items-center justify-between gap-3 border-b py-4"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">{p.full_address}</p>
                    <p className="mt-0.5 text-sm text-muted-foreground">
                      {p.muni_desc} · {p.class_desc ?? p.class} · Assessed{" "}
                      <span className="font-mono">
                        {p.county_total != null
                          ? `$${Number(p.county_total).toLocaleString()}`
                          : "—"}
                      </span>
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    render={<Link href={`/score/${p.parid}`} />}
                  >
                    Get savings score
                    <span className="font-mono">→</span>
                  </Button>
                </li>
              ))}
            </ul>
          </>
        )}
      </main>

      <SiteFooter />
    </div>
  );
}
