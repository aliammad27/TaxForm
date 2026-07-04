import Stripe from "stripe";

let stripe: Stripe | undefined;

export const DIY_FLAT_FEE_CENTS = parseInt(
  process.env.STRIPE_DIY_FLAT_FEE_CENTS ?? "4900",
  10
);

export const CONTINGENCY_PCT = parseFloat(
  process.env.STRIPE_CONTINGENCY_PCT ?? "0.25"
);

export function isStripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

export function getStripe(): Stripe {
  if (!stripe) {
    if (!process.env.STRIPE_SECRET_KEY) {
      throw new Error("STRIPE_SECRET_KEY is not set");
    }
    stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  }
  return stripe;
}

export async function getOrCreateStripeCustomer(params: {
  clientId: string;
  email: string;
  name: string | null;
  existingCustomerId: string | null;
}): Promise<string> {
  if (params.existingCustomerId) return params.existingCustomerId;
  const customer = await getStripe().customers.create({
    email: params.email,
    name: params.name ?? undefined,
    metadata: { client_id: params.clientId },
  });
  return customer.id;
}
