#!/usr/bin/env bash
# release.sh — Build and package k999s for all platforms.
#
# Usage:
#   ./scripts/release.sh              # use version from VERSION file
#   ./scripts/release.sh v1.2.0       # override version
#   ./scripts/release.sh v1.2.0 --install  # also install binary to /usr/local/bin
#
# Output: dist/
#   k999s_v1.2.0_darwin_arm64.tar.gz
#   k999s_v1.2.0_darwin_amd64.tar.gz
#   k999s_v1.2.0_linux_amd64.tar.gz
#   k999s_v1.2.0_linux_arm64.tar.gz
#   k999s_v1.2.0_windows_amd64.zip
#   checksums.txt

# rebuild binary ล่าสุด:
# cd /Users/peerawat.ujaiyen/MyCode/k999s-dashboard
# cd web && npm run build && cd .. && make build
# ./k999s --version  # k999s v0.1.0

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# ── colours ──────────────────────────────────────────────────────────────────
GREEN='\033[0;32m'; BLUE='\033[0;34m'; RED='\033[0;31m'; YELLOW='\033[1;33m'; NC='\033[0m'
info()  { echo -e "${BLUE}▶${NC} $*"; }
ok()    { echo -e "${GREEN}✓${NC} $*"; }
warn()  { echo -e "${YELLOW}!${NC} $*"; }
die()   { echo -e "${RED}✗${NC} $*" >&2; exit 1; }

# ── args ──────────────────────────────────────────────────────────────────────
VERSION_ARG="${1:-}"
INSTALL=false
for arg in "$@"; do [[ "$arg" == "--install" ]] && INSTALL=true; done

if [[ -n "$VERSION_ARG" && "$VERSION_ARG" != --* ]]; then
  VERSION="$VERSION_ARG"
  VERSION="${VERSION#v}"   # strip leading 'v' for the file; we'll add it back for tags
else
  VERSION="$(cat VERSION | tr -d '[:space:]')"
fi

TAG="v${VERSION}"
LDFLAGS="-s -w -X main.Version=${TAG}"
DIST="$ROOT/dist"

# ── pre-flight checks ─────────────────────────────────────────────────────────
command -v go   >/dev/null || die "go not found"
command -v npm  >/dev/null || die "npm not found"

info "Releasing k999s ${TAG}"

# Warn if there are uncommitted changes
if ! git diff --quiet 2>/dev/null; then
  warn "Working directory has uncommitted changes"
fi

# ── build frontend ────────────────────────────────────────────────────────────
info "Building React frontend..."
(cd web && npm run build) || die "Frontend build failed"
ok "Frontend built → internal/frontend/dist/"

# ── prepare dist dir ─────────────────────────────────────────────────────────
rm -rf "$DIST"
mkdir -p "$DIST"

# ── cross-compile targets ─────────────────────────────────────────────────────
declare -a TARGETS=(
  "darwin  arm64"
  "darwin  amd64"
  "linux   amd64"
  "linux   arm64"
  "windows amd64"
)

info "Cross-compiling for all platforms..."

CHECKSUM_FILE="$DIST/checksums.txt"

for target in "${TARGETS[@]}"; do
  read -r GOOS GOARCH <<< "$target"
  BINARY="k999s"
  [[ "$GOOS" == "windows" ]] && BINARY="k999s.exe"

  ARCHIVE_NAME="k999s_${TAG}_${GOOS}_${GOARCH}"
  STAGING="$DIST/staging_${GOOS}_${GOARCH}"
  mkdir -p "$STAGING"

  echo -n "  ${GOOS}/${GOARCH}... "

  GOOS="$GOOS" GOARCH="$GOARCH" CGO_ENABLED=0 \
    go build -ldflags "$LDFLAGS" -trimpath \
    -o "$STAGING/$BINARY" ./cmd/k999s

  # Copy README/LICENSE if present
  [[ -f README.md ]]  && cp README.md  "$STAGING/"
  [[ -f LICENSE ]]    && cp LICENSE    "$STAGING/"

  # Create archive
  if [[ "$GOOS" == "windows" ]]; then
    (cd "$STAGING" && zip -q "$DIST/${ARCHIVE_NAME}.zip" .)
    ARCHIVE_FILE="${ARCHIVE_NAME}.zip"
  else
    tar -czf "$DIST/${ARCHIVE_NAME}.tar.gz" -C "$STAGING" .
    ARCHIVE_FILE="${ARCHIVE_NAME}.tar.gz"
  fi

  # Generate checksum
  if command -v sha256sum >/dev/null 2>&1; then
    (cd "$DIST" && sha256sum "$ARCHIVE_FILE" >> "$CHECKSUM_FILE")
  elif command -v shasum >/dev/null 2>&1; then
    (cd "$DIST" && shasum -a 256 "$ARCHIVE_FILE" >> "$CHECKSUM_FILE")
  fi

  rm -rf "$STAGING"
  echo "done"
done

# ── optional local install ────────────────────────────────────────────────────
if [[ "$INSTALL" == true ]]; then
  CURRENT_OS="$(uname -s | tr '[:upper:]' '[:lower:]')"
  CURRENT_ARCH="$(uname -m)"
  [[ "$CURRENT_ARCH" == "x86_64" ]] && CURRENT_ARCH="amd64"
  [[ "$CURRENT_ARCH" == "aarch64" || "$CURRENT_ARCH" == "arm64" ]] && CURRENT_ARCH="arm64"

  INSTALL_SRC="$DIST/k999s_${TAG}_${CURRENT_OS}_${CURRENT_ARCH}.tar.gz"
  INSTALL_DEST="/usr/local/bin/k999s"

  if [[ -f "$INSTALL_SRC" ]]; then
    info "Installing to ${INSTALL_DEST}..."
    TMPDIR=$(mktemp -d)
    tar -xzf "$INSTALL_SRC" -C "$TMPDIR"
    sudo install -m 755 "$TMPDIR/k999s" "$INSTALL_DEST"
    rm -rf "$TMPDIR"
    ok "Installed: $(k999s --version)"
  else
    warn "Could not find archive for ${CURRENT_OS}/${CURRENT_ARCH}, skipping install"
  fi
fi

# ── summary ───────────────────────────────────────────────────────────────────
echo ""
ok "Release ${TAG} complete → dist/"
echo ""
ls -lh "$DIST"/*.tar.gz "$DIST"/*.zip 2>/dev/null | awk '{print "  " $5 "  " $9}'
echo ""
echo -e "  ${BLUE}Checksums:${NC} dist/checksums.txt"
echo ""
echo -e "  ${YELLOW}Next steps:${NC}"
echo "    git tag ${TAG} && git push origin ${TAG}"
echo "    gh release create ${TAG} dist/* --notes 'Release ${TAG}'"
