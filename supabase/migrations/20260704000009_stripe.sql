-- Stripe billing: customer IDs on clients, invoice tracking for DIY/contingency/retainer.

alter table public.clients
  add column if not exists stripe_customer_id text;

create type public.invoice_type as enum ('diy_flat', 'contingency', 'retainer');

create type public.invoice_status as enum ('draft', 'open', 'paid', 'void', 'uncollectible');

create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  appeal_id uuid references public.appeals (id) on delete set null,
  type public.invoice_type not null,
  amount_cents int not null check (amount_cents > 0),
  status public.invoice_status not null default 'draft',
  stripe_invoice_id text,
  stripe_checkout_session_id text,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists invoices_client_id_idx on public.invoices (client_id);
create index if not exists invoices_appeal_id_idx on public.invoices (appeal_id);
create unique index if not exists invoices_stripe_invoice_id_idx
  on public.invoices (stripe_invoice_id) where stripe_invoice_id is not null;

alter table public.invoices enable row level security;

create policy invoices_select_own on public.invoices
  for select using (
    client_id = auth.uid() or public.is_admin()
  );

create policy invoices_admin_all on public.invoices
  for all using (public.is_admin());
