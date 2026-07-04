import Link from "next/link";
import { requireClient } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { STATUS_LABELS } from "@/lib/appeal-status";

export default async function DashboardPage() {
  const profile = await requireClient();
  const supabase = await createClient();

  const [{ count: propertyCount }, { data: appeals }] = await Promise.all([
    supabase
      .from("client_properties")
      .select("id", { count: "exact", head: true }),
    supabase
      .from("appeals")
      .select("id, parid, tax_year, status, hearing_date, filing_deadline")
      .order("created_at", { ascending: false })
      .limit(5),
  ]);

  const active = (appeals ?? []).filter(
    (a) => !["decided", "withdrawn"].includes(a.status)
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">
          Welcome{profile.full_name ? `, ${profile.full_name.split(" ")[0]}` : ""}
        </h1>
        <Button render={<Link href="/dashboard/properties" />}>
          Add a property
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Properties
            </CardTitle>
          </CardHeader>
          <CardContent className="text-3xl font-bold">{propertyCount ?? 0}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Active appeals
            </CardTitle>
          </CardHeader>
          <CardContent className="text-3xl font-bold">{active.length}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total appeals
            </CardTitle>
          </CardHeader>
          <CardContent className="text-3xl font-bold">{appeals?.length ?? 0}</CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent appeals</CardTitle>
        </CardHeader>
        <CardContent>
          {!appeals?.length ? (
            <p className="text-sm text-muted-foreground">
              No appeals yet. Add a property, run its savings score, then start an
              appeal.
            </p>
          ) : (
            <ul className="divide-y">
              {appeals.map((a) => (
                <li key={a.id} className="flex items-center justify-between py-3">
                  <div>
                    <Link
                      href={`/dashboard/appeals/${a.id}`}
                      className="font-medium underline-offset-2 hover:underline"
                    >
                      Parcel {a.parid}
                    </Link>
                    <p className="text-sm text-muted-foreground">
                      Tax year {a.tax_year}
                    </p>
                  </div>
                  <Badge variant="secondary">{STATUS_LABELS[a.status] ?? a.status}</Badge>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
