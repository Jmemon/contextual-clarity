# =============================================================================
# Contextual Clarity - Multi-stage Docker Build
# =============================================================================
# This Dockerfile creates a production image for the Contextual Clarity app.
# It uses a multi-stage build to:
#   1. Build the React frontend with Vite
#   2. Create a production image with Bun backend serving static frontend
#
# Usage:
#   docker build -t contextual-clarity .
#   docker run -p 3000:3000 -v cc-data:/data --env-file .env.production contextual-clarity
#
# The SQLite database is stored at /data/discussion-refine.db by default.
# Mount a volume at /data for persistence.
#
# =============================================================================

# -----------------------------------------------------------------------------
# Stage 1: Build the React frontend
# -----------------------------------------------------------------------------
FROM oven/bun:1 AS frontend-builder

WORKDIR /app/web

# Copy only package files first for better layer caching
# This allows Docker to cache the dependency installation layer
COPY web/package.json web/bun.lock ./

# Install frontend dependencies using frozen lockfile for reproducibility
RUN bun install --frozen-lockfile

# Copy the rest of the frontend source code
COPY web/ ./

# Build the frontend for production (outputs to dist/)
RUN bun run build

# -----------------------------------------------------------------------------
# Stage 2: Build backend and create production image
# -----------------------------------------------------------------------------
FROM oven/bun:1 AS production

WORKDIR /app

# Install curl for health checks (Bun image is Debian-based)
RUN apt-get update && apt-get install -y curl && rm -rf /var/lib/apt/lists/*

# Copy package files and configuration for dependency installation
COPY package.json bun.lock ./

# Copy tsconfig for path alias resolution (Bun uses this for @ imports)
COPY tsconfig.json bunfig.toml ./

# Install production dependencies only (no devDependencies)
RUN bun install --frozen-lockfile --production

# Copy the backend source code
COPY src/ ./src/

# Copy the built frontend from the frontend-builder stage
# The backend server will serve these static files in production
COPY --from=frontend-builder /app/web/dist ./web/dist

# Copy database configuration and migrations
COPY drizzle.config.ts ./
COPY drizzle/ ./drizzle/

# Copy the entrypoint script
COPY scripts/docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh

# Create the data directory for SQLite persistence
# Mount a volume here: -v cc-data:/data
RUN mkdir -p /data

# Set production environment defaults
ENV NODE_ENV=production
ENV DATABASE_TYPE=sqlite
ENV DATABASE_URL=/data/discussion-refine.db
ENV PORT=3000

# Expose the server port
EXPOSE 3000

# Health check configuration
# Verifies the server is responding to HTTP requests
# - interval: check every 30 seconds
# - timeout: fail if no response within 3 seconds
# - start-period: give the app 10 seconds to start before checking
# - retries: fail container after 3 consecutive failures
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1

# Use entrypoint script to run migrations + seed before starting server
CMD ["./docker-entrypoint.sh"]
