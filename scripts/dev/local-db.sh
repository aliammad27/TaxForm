#!/usr/bin/env bash
# Local database bootstrap for machines without Docker.
#
# The canonical local dev flow is `npx supabase start` (requires Docker), which
# runs the full Supabase stack (Postgres + Auth + Storage + API) and applies
# supabase/migrations + supabase/seed.sql automatically.
#
# This script is a fallback: it starts a Homebrew Postgres 17 cluster on the
# same port Supabase local uses (54322), creates shim `auth` and `storage`
# schemas so the migrations apply unmodified, then runs migrations + seed.
# Auth/Storage API features require the real Supabase stack.
set -euo pipefail
cd "$(dirname "$0")/../.."

PG=/opt/homebrew/opt/postgresql@17/bin
DATA_DIR=/opt/homebrew/var/postgresql@17
PORT=54322

if ! "$PG/pg_ctl" -D "$DATA_DIR" status >/dev/null 2>&1; then
  "$PG/pg_ctl" -D "$DATA_DIR" -o "-p $PORT" -l /tmp/taxform-pg.log start
fi

"$PG/psql" -h 127.0.0.1 -p "$PORT" -d postgres -v ON_ERROR_STOP=1 <<'SQL'
do $$
begin
  if not exists (select from pg_roles where rolname = 'postgres') then
    create role postgres login superuser password 'postgres';
  end if;
end
$$;
SQL

"$PG/psql" -h 127.0.0.1 -p "$PORT" -U "$USER" -d postgres -v ON_ERROR_STOP=1 <<'SQL'
create extension if not exists pgcrypto;
create schema if not exists extensions;
create schema if not exists auth;
create schema if not exists storage;

-- Shim of the Supabase auth schema (subset used by our migrations).
create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text unique,
  encrypted_password text,
  raw_user_meta_data jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

create or replace function auth.uid()
returns uuid
language sql
stable
as 'select nullif(current_setting(''request.jwt.claim.sub'', true), '''')::uuid';

-- Shim of the Supabase storage schema (subset used by our migrations).
create table if not exists storage.buckets (
  id text primary key,
  name text not null,
  public boolean default false,
  created_at timestamptz default now()
);

-- Reset application schema so migrations apply from scratch (mirrors `supabase db reset`).
drop schema if exists public cascade;
create schema public;
grant all on schema public to public;
SQL

for f in supabase/migrations/*.sql; do
  echo "applying $f"
  "$PG/psql" -h 127.0.0.1 -p "$PORT" -U "$USER" -d postgres -v ON_ERROR_STOP=1 -f "$f"
done

echo "applying supabase/seed.sql"
"$PG/psql" -h 127.0.0.1 -p "$PORT" -U "$USER" -d postgres -v ON_ERROR_STOP=1 -f supabase/seed.sql

PARCEL_COUNT=$("$PG/psql" -h 127.0.0.1 -p "$PORT" -U "$USER" -d postgres -tAc "select count(*) from parcels" | tr -d '[:space:]')
echo "Local database ready on port $PORT (${PARCEL_COUNT} seed parcels)"
