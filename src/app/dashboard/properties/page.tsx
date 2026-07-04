import Link from "next/link";
import { Building2 } from "lucide-react";
import { requireClient } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { ParcelSearch } from "./parcel-search";
import { removeProperty } from "./actions";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type PropertyRow = {
  id: string;
  parid: string;
  nickname: string | null;
  parcels: {
    full_address: string | null;
    muni_desc: string | null;
    class_desc: string | null;
    county_total: number | null;
  } | null;
};

export default async function PropertiesPage() {
  await requireClient();
  const supabase = await createClient();

  const { data } = await supabase
    .from("client_properties")
    .select(
      "id, parid, nickname, parcels(full_address, muni_desc, class_desc, county_total)"
    )
    .order("created_at", { ascending: false });
  const properties = (data ?? []) as unknown as PropertyRow[];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Properties"
        description="Add parcels you own to score them and start appeals."
      />

      <Card>
        <CardHeader>
          <CardTitle>Add a property</CardTitle>
          <CardDescription>
            Search Allegheny County records by address or parcel ID.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ParcelSearch />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Your properties</CardTitle>
        </CardHeader>
        <CardContent>
          {properties.length === 0 ? (
            <EmptyState
              icon={Building2}
              title="No properties yet"
              description="Search above to add your first property."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Address</TableHead>
                  <TableHead>Municipality</TableHead>
                  <TableHead>Class</TableHead>
                  <TableHead className="text-right">Assessed value</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {properties.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">
                      <Link
                        href={`/score/${p.parid}`}
                        className="underline-offset-2 hover:underline"
                      >
                        {p.parcels?.full_address ?? p.parid}
                      </Link>
                      {p.nickname && (
                        <span className="ml-2 text-sm text-muted-foreground">
                          ({p.nickname})
                        </span>
                      )}
                    </TableCell>
                    <TableCell>{p.parcels?.muni_desc}</TableCell>
                    <TableCell>{p.parcels?.class_desc}</TableCell>
                    <TableCell className="text-right font-mono">
                      {p.parcels?.county_total != null
                        ? `$${Number(p.parcels.county_total).toLocaleString()}`
                        : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      <form action={removeProperty} className="inline">
                        <input type="hidden" name="id" value={p.id} />
                        <Button type="submit" size="sm" variant="ghost">
                          Remove
                        </Button>
                      </form>
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
