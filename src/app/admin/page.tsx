import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { STATUS_LABELS, STATUS_ORDER } from "@/lib/appeal-status";
import { nextAppealWindow } from "@/lib/appeal-window";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  clients: { email: string; full_name: string | null; company: string | null; tier: string } | null;
  parcels: { full_address: string | null; class_desc: string | null } | null;
  documents: { id: string; type: string; processing_status: string }[];
};

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
  const window = nextAppealWindow();

  const { data } = await supabase
    .from("appeals")
    .select(
      `id, parid, tax_year, status, filing_deadline, filed_date, hearing_date, letter_document_id,
       clients(email, full_name, company, tier),
       parcels(full_address, class_desc),
       documents(id, type, processing_status)`
    )
    .order("created_at", { ascending: false });
  const appeals = (data ?? []) as unknown as AdminAppeal[];

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
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Filing dashboard</h1>
        <Badge variant={window.windowOpen ? "default" : "secondary"}>
          {window.windowOpen ? "Filing window OPEN" : "Filing window closed"} — tax
          year {window.taxYear} deadline {window.filingDeadline}
        </Badge>
      </div>

      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {STATUS_ORDER.map((s) => (
          <Card key={s}>
            <CardHeader className="pb-1">
              <CardTitle className="text-xs font-medium text-muted-foreground">
                {STATUS_LABELS[s]}
              </CardTitle>
            </CardHeader>
            <CardContent className="text-2xl font-bold">
              {byStatus.get(s) ?? 0}
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Filing deadlines</CardTitle>
          </CardHeader>
          <CardContent>
            {needsFiling.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nothing waiting to be filed.
              </p>
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
                          days <= 14 ? "font-semibold text-red-600" : "text-muted-foreground"
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
          </CardHeader>
          <CardContent>
            {upcomingHearings.length === 0 ? (
              <p className="text-sm text-muted-foreground">No hearings scheduled.</p>
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
            <p className="text-sm text-muted-foreground">No appeals yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Property</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Year</TableHead>
                  <TableHead>Status</TableHead>
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
                      <div className="flex flex-wrap gap-1">
                        {checklist(a).map((c) => (
                          <Badge
                            key={c.label}
                            variant={c.done ? "default" : "outline"}
                            className="text-xs"
                          >
                            {c.done ? "✓ " : ""}
                            {c.label}
                          </Badge>
                        ))}
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
