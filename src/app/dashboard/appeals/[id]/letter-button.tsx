"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

function GenerateButton({
  appealId,
  endpoint,
  filename,
  label,
  workingLabel,
  variant,
}: {
  appealId: string;
  endpoint: string;
  filename: string;
  label: string;
  workingLabel: string;
  variant?: "default" | "outline";
}) {
  const [state, setState] = useState<"idle" | "working" | "error" | "warning">("idle");
  const [warning, setWarning] = useState<string | null>(null);

  async function generate() {
    setState("working");
    setWarning(null);
    try {
      const res = await fetch(`/api/appeals/${appealId}/${endpoint}`, {
        method: "POST",
      });
      if (!res.ok) {
        if (res.status === 402) {
          setWarning(
            "Payment required for DIY tier. Complete checkout to unlock letter generation."
          );
          const checkout = await fetch("/api/checkout", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ appeal_id: appealId }),
          });
          if (checkout.ok) {
            const { url } = (await checkout.json()) as { url?: string };
            if (url) window.location.href = url;
          }
          setState("warning");
          return;
        }
        throw new Error(await res.text());
      }
      const verification = res.headers.get("X-Letter-Verification");
      if (verification === "failed") {
        setWarning(
          "Letter generated but verification found mismatches. Review the warning on this page before filing — status was not advanced to ready to file."
        );
        setState("warning");
      } else {
        setState("idle");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setState("error");
    }
  }

  return (
    <div className="space-y-1">
      <Button onClick={generate} disabled={state === "working"} variant={variant}>
        {state === "working" ? workingLabel : label}
      </Button>
      {state === "error" && (
        <p className="text-sm text-destructive">
          Generation failed. Make sure the parcel has comparable sales data.
        </p>
      )}
      {warning && (
        <p className="text-sm text-amber-700 dark:text-amber-400">{warning}</p>
      )}
    </div>
  );
}

export function LetterButton({ appealId }: { appealId: string }) {
  return (
    <div className="flex flex-wrap gap-3">
      <GenerateButton
        appealId={appealId}
        endpoint="letter"
        filename="appeal-letter.pdf"
        label="Generate appeal letter (PDF)"
        workingLabel="Generating letter..."
      />
      <GenerateButton
        appealId={appealId}
        endpoint="package"
        filename="evidence-package.pdf"
        label="Generate evidence package (PDF)"
        workingLabel="Building package..."
        variant="outline"
      />
    </div>
  );
}
