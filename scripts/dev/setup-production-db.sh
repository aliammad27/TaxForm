#!/usr/bin/env bash
# Push schema + seed to Supabase and load county reference data.
set -euo pipefail
cd "$(dirname "$0")/../.."

if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL is not set in .env"
  exit 1
fi

echo "==> Pushing migrations + seed (includes ~440 parcel fixture) to Supabase..."
npx supabase db push --db-url "$DATABASE_URL" --include-seed --yes

echo "==> Loading Common Level Ratio..."
npm run ingest:clr

PARCEL_COUNT=$(psql "$DATABASE_URL" -tAc "select count(*) from parcels" 2>/dev/null | tr -d '[:space:]' || echo 0)
if [[ "${PARCEL_COUNT:-0}" -lt 300 ]]; then
  echo "==> Parcel count below 300; loading Allegheny subset (30k records)..."
  npm run ingest:parcels -- --limit 30000
else
  echo "==> Seed fixture loaded (${PARCEL_COUNT} parcels); skipping bulk ingestion."
fi

echo "==> Loading BPAAR appeal outcomes..."
npm run ingest:appeals

echo "Done. Test search on Vercel with: 3409 DENNY ST"
