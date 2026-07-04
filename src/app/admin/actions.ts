"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  CONTINGENCY_PCT,
  getOrCreateStripeCustomer,
  getStripe,
  isStripeConfigured,
} from "@/lib/stripe";

export async function assignAdmin(formData: FormData) {
  await requireAdmin();
  const appealId = String(formData.get("appeal_id") ?? "");
  const adminId = String(formData.get("admin_id") ?? "");
  if (!appealId) return;

  const supabase = await createClient();
  await supabase
    .from("appeals")
    .update({
      assigned_admin_id: adminId || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", appealId);

  revalidatePath("/admin");
}

/** Creates a Stripe invoice for a decided commercial appeal (contingency fee). */
export async function createContingencyInvoice(formData: FormData) {
  await requireAdmin();
  if (!isStripeConfigured()) return;

  const appealId = String(formData.get("appeal_id") ?? "");
  if (!appealId) return;

  const supabase = await createClient();
  const { data: appeal } = await supabase
    .from("appeals")
    .select(
      "id, client_id, parid, tax_year, outcome_total, parcels(county_total), clients(email, full_name, company, tier, stripe_customer_id)"
    )
    .eq("id", appealId)
    .single();

  if (!appeal?.outcome_total) return;
  const client = appeal.clients as unknown as {
    email: string;
    full_name: string | null;
    company: string | null;
    tier: string;
    stripe_customer_id: string | null;
  } | null;
  if (!client || client.tier === "residential_diy") return;

  const parcel = appeal.parcels as unknown as { county_total: number | null } | null;
  const priorAssessed = parcel?.county_total ?? 0;
  const reduction = Math.max(0, priorAssessed - appeal.outcome_total);
  const estimatedAnnualSavings = Math.round((reduction * 25) / 1000);
  const amountCents = Math.round(estimatedAnnualSavings * CONTINGENCY_PCT * 100);
  if (amountCents < 100) return;

  const admin = createAdminClient();
  const customerId = await getOrCreateStripeCustomer({
    clientId: appeal.client_id,
    email: client.email,
    name: client.company || client.full_name,
    existingCustomerId: client.stripe_customer_id,
  });

  if (!client.stripe_customer_id) {
    await admin
      .from("clients")
      .update({ stripe_customer_id: customerId })
      .eq("id", appeal.client_id);
  }

  const stripeInvoice = await getStripe().invoices.create({
    customer: customerId,
    collection_method: "send_invoice",
    days_until_due: 30,
    metadata: {
      appeal_id: appealId,
      invoice_type: "contingency",
    },
  });

  await getStripe().invoiceItems.create({
    customer: customerId,
    invoice: stripeInvoice.id,
    amount: amountCents,
    currency: "usd",
    description: `Contingency fee (${(CONTINGENCY_PCT * 100).toFixed(0)}% of assessment reduction) — parcel ${appeal.parid}`,
  });

  const finalized = await getStripe().invoices.finalizeInvoice(stripeInvoice.id);
  await getStripe().invoices.sendInvoice(finalized.id);

  await admin.from("invoices").insert({
    client_id: appeal.client_id,
    appeal_id: appealId,
    type: "contingency",
    amount_cents: amountCents,
    status: "open",
    stripe_invoice_id: finalized.id,
    description: `Contingency ${(CONTINGENCY_PCT * 100).toFixed(0)}% — tax year ${appeal.tax_year}`,
  });

  revalidatePath("/admin");
}
