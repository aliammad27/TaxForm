-- Distributed rate limiting fallback: fixed-window counters shared across
-- serverless instances (used when Upstash Redis is not configured).
create table public.rate_limits (
  key text primary key,
  window_start timestamptz not null default now(),
  count int not null default 0
);

alter table public.rate_limits enable row level security;
-- No policies: only the service role (direct pg pool) touches this table.
