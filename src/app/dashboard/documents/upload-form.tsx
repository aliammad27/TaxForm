"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Property = { parid: string; address: string | null };

export function UploadForm({ properties }: { properties: Property[] }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [state, setState] = useState<{ status: "idle" | "uploading"; error?: string }>(
    { status: "idle" }
  );

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setState({ status: "uploading" });
    try {
      const res = await fetch("/api/documents/upload", { method: "POST", body: form });
      const json = await res.json();
      if (!res.ok) {
        setState({ status: "idle", error: json.message ?? json.error ?? "Upload failed" });
        return;
      }
      formRef.current?.reset();
      setState({ status: "idle" });
      router.refresh();
    } catch {
      setState({ status: "idle", error: "Upload failed" });
    }
  }

  return (
    <form ref={formRef} onSubmit={onSubmit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-1">
          <Label htmlFor="type">Document type</Label>
          <select
            id="type"
            name="type"
            className="w-full rounded-md border bg-transparent px-3 py-2 text-sm"
            defaultValue="rent_roll"
          >
            <option value="rent_roll">Rent roll</option>
            <option value="t12">T-12 operating statement</option>
            <option value="photo">Property photo</option>
            <option value="other">Other</option>
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="parid">Property</Label>
          <select
            id="parid"
            name="parid"
            className="w-full rounded-md border bg-transparent px-3 py-2 text-sm"
            defaultValue=""
          >
            <option value="">Not linked</option>
            {properties.map((p) => (
              <option key={p.parid} value={p.parid}>
                {p.address ?? p.parid}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="file">File (PDF, CSV, or image)</Label>
          <Input id="file" name="file" type="file" required accept=".pdf,.csv,.txt,image/*" />
        </div>
      </div>
      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      <Button type="submit" disabled={state.status === "uploading"}>
        {state.status === "uploading" ? "Uploading..." : "Upload"}
      </Button>
    </form>
  );
}
