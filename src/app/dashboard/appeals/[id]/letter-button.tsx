"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

export function LetterButton({ appealId }: { appealId: string }) {
  const [state, setState] = useState<"idle" | "working" | "error">("idle");

  async function generate() {
    setState("working");
    try {
      const res = await fetch(`/api/appeals/${appealId}/letter`, {
        method: "POST",
      });
      if (!res.ok) throw new Error(await res.text());
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "appeal-letter.pdf";
      a.click();
      URL.revokeObjectURL(url);
      setState("idle");
    } catch {
      setState("error");
    }
  }

  return (
    <div className="space-y-1">
      <Button onClick={generate} disabled={state === "working"}>
        {state === "working" ? "Generating letter..." : "Generate appeal letter (PDF)"}
      </Button>
      {state === "error" && (
        <p className="text-sm text-destructive">
          Letter generation failed. Make sure the parcel has comparable sales data.
        </p>
      )}
    </div>
  );
}
