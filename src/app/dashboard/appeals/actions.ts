"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { nextAppealWindow } from "@/lib/appeal-window";
import { STATUS_ORDER, type AppealStatus } from "@/lib/appeal-status";

export async function createAppeal(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const parid = String(formData.get("parid"));
  const window = nextAppealWindow();

  const { data: appeal } = await supabase
    .from("appeals")
    .insert({
      client_id: user.id,
      parid,
      tax_year: window.taxYear,
      status: "draft",
      filing_deadline: window.filingDeadline,
    })
    .select("id")
    .single();

  if (appeal) redirect(`/dashboard/appeals/${appeal.id}`);
}

export async function updateAppealStatus(formData: FormData) {
  const supabase = await createClient();
  const id = String(formData.get("id"));
  const status = String(formData.get("status")) as AppealStatus;
  if (!STATUS_ORDER.includes(status)) return;

  const patch: Record<string, unknown> = {
    status,
    updated_at: new Date().toISOString(),
  };
  if (status === "filed") patch.filed_date = new Date().toISOString().slice(0, 10);
  if (status === "decided") patch.decided_date = new Date().toISOString().slice(0, 10);

  const hearingDate = String(formData.get("hearing_date") || "");
  if (hearingDate) patch.hearing_date = hearingDate;
  const outcome = String(formData.get("outcome_total") || "");
  if (outcome) patch.outcome_total = Number(outcome);

  await supabase.from("appeals").update(patch).eq("id", id);
  revalidatePath(`/dashboard/appeals/${id}`);
  revalidatePath("/dashboard/appeals");
  revalidatePath("/admin");
}
