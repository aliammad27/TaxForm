import Link from "next/link";
import { requireClient } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { STATUS_LABELS } from "@/lib/appeal-status";
import { DEFAULT_COUNTY, getCountyAdapter } from "@/lib/counties/registry";
import { createAppeal } from "./actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type AppealRow = {
  id: string;
  parid: string;
  tax_year: number;
  status: string;
  filing_deadline: string | null;
  hearing_date: string | null;
  parcels: { full_address: string | null } | null;
};

type PropertyRow = {
  parid: string;
  parcels: { full_address: string | null } | null;
};

export default async function AppealsPage() {
  await requireClient();
  const supabase = await createClient();
  const window = await getCountyAdapter(DEFAULT_COUNTY).appealWindow();

  const [{ data: appealsData }, { data: propsData }] = await Promise.all([
    supabase
      .from("appeals")
      .select(
        "id, parid, tax_year, status, filing_deadline, hearing_date, parcels(full_address)"
      )
      .order("created_at", { ascending: false }),
    supabase.from("client_properties").select("parid, parcels(full_address)"),
  ]);
  const appeals = (appealsData ?? []) as unknown as AppealRow[];
  const properties = (propsData ?? []) as unknown as PropertyRow[];

  const appealedParids = new Set(
    appeals.filter((a) => a.tax_year === window.taxYear).map((a) => a.parid)
  );
  const eligible = properties.filter((p) => !appealedParids.has(p.parid));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Appeals"
        description="Start and track assessment appeals for your properties."
      >
        <Badge variant={window.windowOpen ? "default" : "secondary"}>
          Tax year {window.taxYear} filing deadline: {window.filingDeadline}
        </Badge>
      </PageHeader>

      {eligible.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Start an appeal</CardTitle>
            <CardDescription>
              These properties don&apos;t have a {window.taxYear} appeal yet.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {eligible.map((p) => (
              <form
                key={p.parid}
                action={createAppeal}
                className="flex items-center justify-between gap-3 rounded-lg border bg-muted/30 p-3"
              >
                <span className="min-w-0 truncate text-sm font-medium">
                  {p.parcels?.full_address ?? p.parid}
                </span>
                <input type="hidden" name="parid" value={p.parid} />
                <Button type="submit" size="sm" className="shrink-0">
                  Start {window.taxYear} appeal
                </Button>
              </form>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Your appeals</CardTitle>
        </CardHeader>
        <CardContent>
          {appeals.length === 0 ? (
            <EmptyState
              title="No appeals yet"
              description={
                properties.length === 0
                  ? "First add a property, then start an appeal from here."
                  : "Start an appeal for one of your properties above."
              }
            >
              {properties.length === 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  render={<Link href="/dashboard/properties" />}
                >
                  Add a property
                </Button>
              )}
            </EmptyState>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Property</TableHead>
                  <TableHead>Tax year</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Hearing</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {appeals.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="font-medium">
                      {a.parcels?.full_address ?? a.parid}
                    </TableCell>
                    <TableCell>{a.tax_year}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">
                        {STATUS_LABELS[a.status] ?? a.status}
                      </Badge>
                    </TableCell>
                    <TableCell>{a.hearing_date ?? "—"}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        render={<Link href={`/dashboard/appeals/${a.id}`} />}
                      >
                        Open
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
