import Link from "next/link";
import { CalendarClock, Check } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { STATUS_LABELS, STATUS_ORDER } from "@/lib/appeal-status";
import { DEFAULT_COUNTY, getCountyAdapter } from "@/lib/counties/registry";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { AssignSelect } from "./assign-select";
import { createContingencyInvoice } from "./actions";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type AdminAppeal = {
  id: string;
  parid: string;
  tax_year: number;
  status: string;
  filing_deadline: string | null;
  filed_date: string | null;
  hearing_date: string | null;
  letter_document_id: string | null;
  assigned_admin_id: string | null;
  outcome_total: number | null;
  clients: { email: string; full_name: string | null; company: string | null; tier: string } | null;
  parcels: { full_address: string | null; class_desc: string | null } | null;
  documents: { id: string; type: string; processing_status: string; needs_review: boolean }[];
};

function hasReviewFlag(a: AdminAppeal): boolean {
  return a.documents.some((d) => d.needs_review);
}

const TIER_SHORT: Record<string, string> = {
  residential_diy: "DIY",
  commercial_contingency: "Commercial",
  full_service: "Full service",
};

function daysUntil(dateStr: string): number {
  return Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86_400_000);
}

function checklist(a: AdminAppeal): { label: string; done: boolean }[] {
  const isCommercial = (a.parcels?.class_desc ?? "").toUpperCase() !== "RESIDENTIAL";
  const has = (type: string) =>
    a.documents.some((d) => d.type === type && d.processing_status === "processed");
  const items = [
    { label: "Letter", done: Boolean(a.letter_document_id) },
    { label: "Photos", done: has("photo") },
  ];
  if (isCommercial) {
    items.push(
      { label: "Rent roll", done: has("rent_roll") },
      { label: "T-12", done: has("t12") }
    );
  }
  return items;
}

export default async function AdminDashboardPage() {
  const supabase = await createClient();
  const window = await getCountyAdapter(DEFAULT_COUNTY).appealWindow();

  const { data } = await supabase
    .from("appeals")
    .select(
      `id, parid, tax_year, status, filing_deadline, filed_date, hearing_date, letter_document_id, assigned_admin_id, outcome_total,
       clients(email, full_name, company, tier),
       parcels(full_address, class_desc),
       documents(id, type, processing_status, needs_review)`
    )
    .order("created_at", { ascending: false });
  const appeals = (data ?? []) as unknown as AdminAppeal[];

  const { data: adminRows } = await supabase
    .from("clients")
    .select("id, email, full_name")
    .eq("role", "admin")
    .order("email");
  const admins = (adminRows ?? []).map((a) => ({
    id: a.id,
    label: a.full_name || a.email,
  }));

  const active = appeals.filter((a) => !["decided", "withdrawn"].includes(a.status));
  const byStatus = new Map<string, number>();
  for (const a of appeals) byStatus.set(a.status, (byStatus.get(a.status) ?? 0) + 1);

  const needsFiling = active
    .filter((a) => ["draft", "ready_to_file"].includes(a.status) && a.filing_deadline)
    .sort((a, b) => (a.filing_deadline! < b.filing_deadline! ? -1 : 1));

  const upcomingHearings = active
    .filter((a) => a.hearing_date && new Date(a.hearing_date) >= new Date())
    .sort((a, b) => (a.hearing_date! < b.hearing_date! ? -1 : 1));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Filing dashboard"
        description="Pipeline, deadlines, and evidence checklists across all client appeals."
      >
        <Badge variant={window.windowOpen ? "default" : "secondary"}>
          <CalendarClock />
          {window.windowOpen ? "Filing window OPEN" : "Filing window closed"} — tax
          year {window.taxYear} deadline {window.filingDeadline}
        </Badge>
      </PageHeader>

      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {STATUS_ORDER.map((s) => (
          <Card key={s} size="sm">
            <CardContent className="space-y-1">
              <p className="font-mono text-xs tracking-wider text-muted-foreground uppercase">
                {STATUS_LABELS[s]}
              </p>
              <p className="text-2xl font-semibold tabular-nums">
                {byStatus.get(s) ?? 0}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Filing deadlines</CardTitle>
            <CardDescription>
              Draft and ready-to-file appeals, most urgent first.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {needsFiling.length === 0 ? (
              <EmptyState
                title="Nothing waiting to be filed"
                className="py-6"
              />
            ) : (
              <ul className="space-y-2">
                {needsFiling.map((a) => {
                  const days = daysUntil(a.filing_deadline!);
                  return (
                    <li key={a.id} className="flex items-center justify-between text-sm">
                      <Link
                        href={`/dashboard/appeals/${a.id}`}
                        className="font-medium underline-offset-2 hover:underline"
                      >
                        {a.parcels?.full_address ?? a.parid}
                      </Link>
                      <span
                        className={
                          days <= 14
                            ? "font-semibold text-destructive"
                            : "text-muted-foreground"
                        }
                      >
                        {days < 0 ? "past due" : `${days} days left`}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Hearing calendar</CardTitle>
            <CardDescription>Upcoming BPAAR hearings.</CardDescription>
          </CardHeader>
          <CardContent>
            {upcomingHearings.length === 0 ? (
              <EmptyState
                title="No hearings scheduled"
                className="py-6"
              />
            ) : (
              <ul className="space-y-2">
                {upcomingHearings.map((a) => (
                  <li key={a.id} className="flex items-center justify-between text-sm">
                    <Link
                      href={`/dashboard/appeals/${a.id}`}
                      className="font-medium underline-offset-2 hover:underline"
                    >
                      {a.parcels?.full_address ?? a.parid}
                    </Link>
                    <span className="text-muted-foreground">{a.hearing_date}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All appeals</CardTitle>
        </CardHeader>
        <CardContent>
          {appeals.length === 0 ? (
            <EmptyState title="No appeals yet" className="py-6" />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Property</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Year</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Assigned to</TableHead>
                  <TableHead>Checklist</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {appeals.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="font-medium">
                      <Link
                        href={`/dashboard/appeals/${a.id}`}
                        className="underline-offset-2 hover:underline"
                      >
                        {a.parcels?.full_address ?? a.parid}
                      </Link>
                    </TableCell>
                    <TableCell className="text-sm">
                      {a.clients?.company || a.clients?.full_name || a.clients?.email}
                      <span className="ml-2 text-xs text-muted-foreground">
                        {TIER_SHORT[a.clients?.tier ?? ""] ?? ""}
                      </span>
                    </TableCell>
                    <TableCell>{a.tax_year}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">
                        {STATUS_LABELS[a.status] ?? a.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <AssignSelect
                        appealId={a.id}
                        assignedAdminId={a.assigned_admin_id}
                        admins={admins}
                      />
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap items-center gap-1">
                        {hasReviewFlag(a) && (
                          <Badge variant="outline" className="text-xs text-amber-700">
                            Review
                          </Badge>
                        )}
                        {checklist(a).map((c) => (
                          <Badge
                            key={c.label}
                            variant={c.done ? "default" : "outline"}
                            className="text-xs"
                          >
                            {c.done && <Check />}
                            {c.label}
                          </Badge>
                        ))}
                        {a.status === "decided" &&
                          a.outcome_total != null &&
                          (a.clients?.tier === "commercial_contingency" ||
                            a.clients?.tier === "full_service") && (
                            <form action={createContingencyInvoice}>
                              <input type="hidden" name="appeal_id" value={a.id} />
                              <button
                                type="submit"
                                className="text-xs font-medium text-primary underline-offset-2 hover:underline"
                              >
                                Invoice
                              </button>
                            </form>
                          )}
                      </div>
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
