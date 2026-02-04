#!/usr/bin/env bash

# =============================================================================
# Contextual Clarity - Production Build Script
# =============================================================================
# This script builds the application for production deployment.
# It performs the following steps:
#   1. Environment validation
#   2. TypeScript type checking (backend)
#   3. Frontend build (React + Vite)
#   4. Reports build status
#
# Usage:
#   ./scripts/build.sh
#   bun run build
#
# Exit codes:
#   0 - Build successful
#   1 - Build failed
# =============================================================================

set -e  # Exit immediately if any command fails

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# -----------------------------------------------------------------------------
# Helper functions
# -----------------------------------------------------------------------------

# Print a section header
print_header() {
    echo ""
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BLUE}  $1${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
}

# Print success message
print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

# Print error message
print_error() {
    echo -e "${RED}✗ $1${NC}"
}

# Print warning message
print_warning() {
    echo -e "${YELLOW}⚠ $1${NC}"
}

# Print info message
print_info() {
    echo -e "${BLUE}ℹ $1${NC}"
}

# Get the project root directory (where this script is located, up one level)
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

# Track build start time
BUILD_START=$(date +%s)

# =============================================================================
# Step 1: Environment Check
# =============================================================================
print_header "Step 1: Environment Check"

# Check if bun is installed
if ! command -v bun &> /dev/null; then
    print_error "Bun is not installed. Please install Bun first."
    echo "  Install: curl -fsSL https://bun.sh/install | bash"
    exit 1
fi
print_success "Bun is installed: $(bun --version)"

# Check if node_modules exist
if [ ! -d "node_modules" ]; then
    print_warning "node_modules not found. Running bun install..."
    bun install
fi
print_success "Backend dependencies installed"

if [ ! -d "web/node_modules" ]; then
    print_warning "web/node_modules not found. Running bun install in web/..."
    cd web && bun install && cd ..
fi
print_success "Frontend dependencies installed"

# =============================================================================
# Step 2: TypeScript Type Checking (Backend - src only)
# =============================================================================
print_header "Step 2: TypeScript Type Check (Backend)"

# Check only src directory using tsconfig.build.json
# This excludes tests (which are checked separately in CI)
print_info "Running TypeScript compiler check on src/..."
if bun tsc --project tsconfig.build.json; then
    print_success "Backend TypeScript check passed"
else
    print_error "Backend TypeScript check failed"
    exit 1
fi

# =============================================================================
# Step 3: TypeScript Type Checking (Frontend)
# =============================================================================
print_header "Step 3: TypeScript Type Check (Frontend)"

print_info "Running TypeScript compiler check for frontend..."
cd web
if bun tsc --noEmit; then
    print_success "Frontend TypeScript check passed"
else
    print_error "Frontend TypeScript check failed"
    exit 1
fi
cd ..

# =============================================================================
# Step 4: Build Frontend
# =============================================================================
print_header "Step 4: Build Frontend"

print_info "Building React frontend with Vite..."
cd web
if bun run build; then
    print_success "Frontend build completed"
else
    print_error "Frontend build failed"
    exit 1
fi
cd ..

# Verify build output exists
if [ -d "web/dist" ] && [ -f "web/dist/index.html" ]; then
    print_success "Build output verified at web/dist/"

    # Show build output size
    BUILD_SIZE=$(du -sh web/dist | cut -f1)
    print_info "Build size: $BUILD_SIZE"

    # List main output files
    echo ""
    print_info "Build artifacts:"
    ls -la web/dist/
else
    print_error "Build output missing or incomplete"
    exit 1
fi

# =============================================================================
# Build Summary
# =============================================================================
BUILD_END=$(date +%s)
BUILD_DURATION=$((BUILD_END - BUILD_START))

print_header "Build Complete!"

echo ""
echo -e "${GREEN}╔═══════════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║  Build successful!                                                    ║${NC}"
echo -e "${GREEN}╠═══════════════════════════════════════════════════════════════════════╣${NC}"
echo -e "${GREEN}║  Duration: ${BUILD_DURATION} seconds                                                  ║${NC}"
echo -e "${GREEN}║  Output:   web/dist/                                                  ║${NC}"
echo -e "${GREEN}║                                                                       ║${NC}"
echo -e "${GREEN}║  Next steps:                                                          ║${NC}"
echo -e "${GREEN}║    - Docker build: docker build -t contextual-clarity .               ║${NC}"
echo -e "${GREEN}║    - Docker run:   docker run -p 3000:3000 contextual-clarity         ║${NC}"
echo -e "${GREEN}╚═══════════════════════════════════════════════════════════════════════╝${NC}"
echo ""

exit 0
