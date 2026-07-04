"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function ProcessButton({ documentId }: { documentId: string }) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "working" | "error">("idle");

  async function process() {
    setState("working");
    const res = await fetch(`/api/documents/${documentId}/process`, {
      method: "POST",
    });
    if (res.ok) {
      setState("idle");
      router.refresh();
    } else {
      setState("error");
    }
  }

  return (
    <div className="flex items-center gap-2">
      <Button size="sm" variant="outline" onClick={process} disabled={state === "working"}>
        {state === "working" ? "Extracting..." : "Extract data"}
      </Button>
      {state === "error" && <span className="text-xs text-destructive">failed</span>}
    </div>
  );
}
