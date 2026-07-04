#!/usr/bin/env bash
# One-command local bootstrap: env file, database, seed fixture, optional full ingestion.
set -euo pipefail
cd "$(dirname "$0")/../.."

PARCEL_THRESHOLD=300

echo "==> TaxForm local setup"

if [[ ! -f .env ]]; then
  echo "    Creating .env from .env.example"
  cp .env.example .env
fi

set -a
# shellcheck disable=SC1091
source .env
set +a

start_supabase() {
  if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
    echo "==> Starting Supabase (Docker)..."
    npx supabase start
    echo "==> Copy Supabase keys from the output above into .env if not already set."
    return 0
  fi
  return 1
}

start_local_db() {
  echo "==> Starting Homebrew Postgres fallback..."
  ./scripts/dev/local-db.sh
}

parcel_count() {
  if [[ -z "${DATABASE_URL:-}" ]]; then
    echo 0
    return
  fi
  psql "$DATABASE_URL" -tAc "select count(*) from parcels" 2>/dev/null | tr -d '[:space:]' || echo 0
}

if start_supabase; then
  :
elif start_local_db; then
  :
else
  echo "Could not start a database. Install Docker for Supabase or Homebrew Postgres 17."
  exit 1
fi

set -a
# shellcheck disable=SC1091
source .env
set +a

count="$(parcel_count)"
echo "==> Parcels in database: ${count:-0}"

if [[ "${count:-0}" -lt "$PARCEL_THRESHOLD" ]]; then
  echo "==> Parcel count below ${PARCEL_THRESHOLD}; loading Allegheny subset via API..."
  npm run ingest:parcels -- --limit 30000
  count="$(parcel_count)"
  echo "==> Parcels after ingestion: ${count:-0}"
else
  echo "==> Seed fixture looks good (>= ${PARCEL_THRESHOLD} parcels)."
fi

echo ""
echo "Setup complete. Try search:"
echo "  npm run dev"
echo "  open http://localhost:3000/score?q=719+mulkerrin"
echo "  curl http://localhost:3000/api/health"
echo ""
echo "Golden test addresses: 3409 DENNY ST · 719 mulkerrin · 429 Forbes"
