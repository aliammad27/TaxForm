-- Cursor/state storage for the scheduled county-data refresh Edge Function.
create table public.ingest_state (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.ingest_state enable row level security;
-- service-role only: no policies.
