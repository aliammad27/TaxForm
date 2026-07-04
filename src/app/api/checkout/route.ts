import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  DIY_FLAT_FEE_CENTS,
  getOrCreateStripeCustomer,
  getStripe,
  isStripeConfigured,
} from "@/lib/stripe";

export async function POST(request: Request) {
  if (!isStripeConfigured()) {
    return NextResponse.json(
      { error: "stripe_unconfigured", message: "Billing is not enabled." },
      { status: 503 }
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as { appeal_id?: string };
  const appealId = body.appeal_id;
  if (!appealId) {
    return NextResponse.json({ error: "appeal_id required" }, { status: 400 });
  }

  const { data: client } = await supabase
    .from("clients")
    .select("id, email, full_name, company, tier, stripe_customer_id")
    .eq("id", user.id)
    .single();

  if (!client || client.tier !== "residential_diy") {
    return NextResponse.json(
      { error: "not_diy_tier", message: "Checkout applies to DIY tier only." },
      { status: 422 }
    );
  }

  const { data: appeal } = await supabase
    .from("appeals")
    .select("id, client_id, parid")
    .eq("id", appealId)
    .single();
  if (!appeal || appeal.client_id !== user.id) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const customerId = await getOrCreateStripeCustomer({
    clientId: client.id,
    email: client.email,
    name: client.company || client.full_name,
    existingCustomerId: client.stripe_customer_id,
  });

  if (!client.stripe_customer_id && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const admin = createAdminClient();
    await admin
      .from("clients")
      .update({ stripe_customer_id: customerId })
      .eq("id", client.id);
  }

  const session = await getStripe().checkout.sessions.create({
    mode: "payment",
    customer: customerId,
    line_items: [
      {
        price_data: {
          currency: "usd",
          unit_amount: DIY_FLAT_FEE_CENTS,
          product_data: {
            name: "Appeal letter & evidence package",
            description: `Parcel ${appeal.parid}`,
          },
        },
        quantity: 1,
      },
    ],
    metadata: {
      client_id: client.id,
      appeal_id: appealId,
      invoice_type: "diy_flat",
    },
    success_url: `${siteUrl}/dashboard/appeals/${appealId}?paid=1`,
    cancel_url: `${siteUrl}/dashboard/appeals/${appealId}`,
  });

  if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const admin = createAdminClient();
    await admin.from("invoices").insert({
      client_id: client.id,
      appeal_id: appealId,
      type: "diy_flat",
      amount_cents: DIY_FLAT_FEE_CENTS,
      status: "open",
      stripe_checkout_session_id: session.id,
      description: "DIY appeal letter flat fee",
    });
  }

  return NextResponse.json({ url: session.url });
}
