"use client";

import { useActionState } from "react";
import { searchAction, addProperty, type SearchState } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const initialState: SearchState = { results: [] };

export function ParcelSearch() {
  const [state, action, pending] = useActionState(searchAction, initialState);

  return (
    <div className="space-y-4">
      <form action={action} className="flex gap-2">
        <Input
          name="query"
          placeholder="Search by address or 16-digit parcel ID"
          className="max-w-lg"
        />
        <Button type="submit" disabled={pending}>
          {pending ? "Searching..." : "Search"}
        </Button>
      </form>
      {state.error && <p className="text-sm text-muted-foreground">{state.error}</p>}
      {state.results.length > 0 && (
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
            {state.results.map((p) => (
              <TableRow key={p.parid}>
                <TableCell className="font-medium">{p.full_address}</TableCell>
                <TableCell>{p.muni_desc}</TableCell>
                <TableCell>{p.class_desc ?? p.class}</TableCell>
                <TableCell className="text-right">
                  {p.county_total != null
                    ? `$${Number(p.county_total).toLocaleString()}`
                    : "—"}
                </TableCell>
                <TableCell>
                  <form action={addProperty}>
                    <input type="hidden" name="parid" value={p.parid} />
                    <Button type="submit" size="sm" variant="outline">
                      Add
                    </Button>
                  </form>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
