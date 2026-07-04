import Link from "next/link";
import { searchParcels } from "@/lib/parcels";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

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
    } catch (err) {
      console.error("Parcel search failed:", err);
      error =
        err instanceof Error && err.message.includes("DATABASE_URL")
          ? "Database is not configured. Set DATABASE_URL in .env and start Postgres."
          : "Search is temporarily unavailable.";
    }
  }

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-12">
      <Link href="/" className="text-sm text-muted-foreground hover:underline">
        &larr; TaxForm
      </Link>
      <h1 className="mt-4 text-2xl font-bold">Find your property</h1>

      <form action="/score" method="GET" className="mt-6 flex gap-2">
        <Input name="q" defaultValue={q ?? ""} placeholder="Address or 16-digit parcel ID" />
        <Button type="submit">Search</Button>
      </form>

      {error && <p className="mt-6 text-sm text-red-600">{error}</p>}
      {q && !error && results.length === 0 && (
        <p className="mt-6 text-sm text-muted-foreground">
          No parcels matched &ldquo;{q}&rdquo;. Try just the street number and name.
        </p>
      )}

      <div className="mt-6 space-y-3">
        {results.map((p) => (
          <Card key={p.parid}>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{p.full_address}</CardTitle>
            </CardHeader>
            <CardContent className="flex items-center justify-between">
              <div className="text-sm text-muted-foreground">
                <p>
                  {p.muni_desc} · {p.class_desc ?? p.class}
                </p>
                <p>
                  Assessed:{" "}
                  {p.county_total != null
                    ? `$${Number(p.county_total).toLocaleString()}`
                    : "—"}
                </p>
              </div>
              <Button render={<Link href={`/score/${p.parid}`} />}>
                Get savings score
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </main>
  );
}
