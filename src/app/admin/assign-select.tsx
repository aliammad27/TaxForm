"use client";

import { useRef, useTransition } from "react";
import { assignAdmin } from "./actions";

export function AssignSelect({
  appealId,
  assignedAdminId,
  admins,
}: {
  appealId: string;
  assignedAdminId: string | null;
  admins: { id: string; label: string }[];
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, startTransition] = useTransition();

  return (
    <form ref={formRef} action={assignAdmin}>
      <input type="hidden" name="appeal_id" value={appealId} />
      <select
        name="admin_id"
        defaultValue={assignedAdminId ?? ""}
        disabled={pending}
        onChange={() =>
          startTransition(() => {
            formRef.current?.requestSubmit();
          })
        }
        className="h-8 rounded-md border border-input bg-transparent px-2 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:opacity-50"
      >
        <option value="">Unassigned</option>
        {admins.map((a) => (
          <option key={a.id} value={a.id}>
            {a.label}
          </option>
        ))}
      </select>
    </form>
  );
}
