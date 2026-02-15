#!/bin/sh
# =============================================================================
# Docker Entrypoint for Contextual Clarity
# =============================================================================
# This script runs on container startup to:
# 1. Run database migrations (creates tables if needed)
# 2. Seed the database with recall sets (idempotent - skips existing)
# 3. Start the API server
# =============================================================================

set -e

echo "[entrypoint] Starting Contextual Clarity..."
echo "[entrypoint] DATABASE_URL=${DATABASE_URL}"
echo "[entrypoint] NODE_ENV=${NODE_ENV}"

# Run database migrations
echo "[entrypoint] Running database migrations..."
bun run src/storage/migrate.ts

# Seed the database (idempotent - will skip already-seeded sets)
echo "[entrypoint] Seeding database..."
bun run src/storage/seed.ts

# Start the server
echo "[entrypoint] Starting server..."
exec bun run src/api/server.ts
