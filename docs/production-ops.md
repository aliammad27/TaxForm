# Production ops checklist

## Point-in-time recovery (PITR)

Enable on the production Supabase project before onboarding paying clients:

1. Open [Supabase Dashboard](https://supabase.com/dashboard) → your project → **Database** → **Backups**
2. Upgrade to a plan that includes PITR if not already enabled
3. Confirm **Point-in-time recovery** shows as **Enabled**
4. Note the retention window (typically 7 days on Pro)

PITR cannot be enabled via application code — it is a one-time dashboard/MCP configuration step.

## Sentry

Set these environment variables in Vercel (or `.env.local`):

```
NEXT_PUBLIC_SENTRY_DSN=https://...@sentry.io/...
SENTRY_ORG=your-org
SENTRY_PROJECT=taxform
```

Sentry initializes only when `NEXT_PUBLIC_SENTRY_DSN` is set.

## Stripe

```
STRIPE_SECRET_KEY=sk_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_DIY_FLAT_FEE_CENTS=4900
STRIPE_CONTINGENCY_PCT=0.25
```

Register webhook endpoint: `https://<your-domain>/api/webhooks/stripe`

Events: `checkout.session.completed`, `invoice.paid`, `invoice.payment_failed`
