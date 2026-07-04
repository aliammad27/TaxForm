import Link from "next/link";
import { ArrowRight, Plus } from "lucide-react";
import { requireClient } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
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
      <PageHeader
        title={`Welcome${profile.full_name ? `, ${profile.full_name.split(" ")[0]}` : ""}`}
        description="Track your properties and appeals at a glance."
      >
        <Button render={<Link href="/dashboard/properties" />}>
          <Plus data-icon="inline-start" />
          Add a property
        </Button>
      </PageHeader>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Properties" value={propertyCount ?? 0} />
        <StatCard label="Active appeals" value={active.length} />
        <StatCard label="Total appeals" value={appeals?.length ?? 0} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent appeals</CardTitle>
          <CardDescription>
            Your five most recently created appeals.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!appeals?.length ? (
            <EmptyState
              title="No appeals yet"
              description="Add a property, run its savings score, then start an appeal."
            >
              <Button
                variant="outline"
                size="sm"
                render={<Link href="/dashboard/properties" />}
              >
                Add a property
                <ArrowRight data-icon="inline-end" />
              </Button>
            </EmptyState>
          ) : (
            <ul className="divide-y">
              {appeals.map((a) => (
                <li
                  key={a.id}
                  className="flex items-center justify-between py-3"
                >
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
                  <Badge variant="secondary">
                    {STATUS_LABELS[a.status] ?? a.status}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {profile.referral_code && (
        <Card>
          <CardHeader>
            <CardTitle>Refer a neighbor</CardTitle>
            <CardDescription>
              Overassessment runs street by street — if your appeal has legs,
              your neighbors&apos; probably do too. Share your link:
            </CardDescription>
          </CardHeader>
          <CardContent>
            <code className="block w-fit rounded-md bg-muted px-3 py-2 font-mono text-sm">
              {`${process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"}/signup?ref=${profile.referral_code}`}
            </code>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
