#!/usr/bin/env bash
# =============================================================================
# Docker Entrypoint for Contextual Clarity
# =============================================================================
# This script runs database migrations and seeds before starting the server.
# It ensures the SQLite database is ready on the persistent volume.
#
# Environment variables:
#   DATABASE_URL  - Path to the SQLite database file (default: /data/discussion-refine.db)
#   SKIP_SEED     - Set to "true" to skip seeding (default: false)
# =============================================================================

set -e

echo "=== Contextual Clarity: Docker Entrypoint ==="

# Run database migrations
echo "[entrypoint] Running database migrations..."
bun run src/storage/migrate.ts

# Seed database if not already seeded (idempotent - skips existing sets)
if [ "${SKIP_SEED}" != "true" ]; then
  echo "[entrypoint] Seeding database (idempotent)..."
  bun run src/storage/seed.ts
else
  echo "[entrypoint] Skipping seed (SKIP_SEED=true)"
fi

echo "[entrypoint] Starting server..."
exec bun run src/api/server.ts
