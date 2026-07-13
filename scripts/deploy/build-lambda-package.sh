#!/usr/bin/env bash
#
# Builds the deployable zip for lambda/process-document.
#
# Assumes:
#   - Run from the repository root, on Node (see package.json engines note below).
#   - AWS CLI is already authenticated (the calling workflow configures OIDC
#     credentials before invoking this script) - used only to read the
#     existing Lambda function's configured architecture, never to change it.
#   - LAMBDA_FUNCTION_NAME env var is set to the existing function's name.
#   - GIT_SHA env var is set (short SHA used to make the zip name unique).
#
# Why architecture is discovered instead of hardcoded: this repo's Prisma
# schema (prisma/schema.prisma) has no way to know whether the *existing*
# Lambda function (created and managed outside this repo) runs on x86_64 or
# arm64. Guessing wrong produces a Prisma engine binary that fails to load at
# invoke time. Reading it from the live function config removes the guess.
#
# Why unused Prisma DB-provider engines are pruned: prisma/schema.prisma
# declares `datasource db { provider = "postgresql" }` only - the MySQL/
# SQLite/SQL Server/CockroachDB WASM engines Prisma generates by default are
# dead weight (measured ~45MB) that this Lambda can never use.

set -euo pipefail

: "${LAMBDA_FUNCTION_NAME:?LAMBDA_FUNCTION_NAME must be set}"
: "${GIT_SHA:?GIT_SHA must be set}"

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
LAMBDA_DIR="$REPO_ROOT/lambda/process-document"
BUILD_DIR="$REPO_ROOT/.build/lambda"
ZIP_PATH="$REPO_ROOT/.build/process-document-${GIT_SHA}.zip"

echo "==> Cleaning previous build output"
rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR"

echo "==> Copying Lambda source files"
cp "$LAMBDA_DIR/index.js" "$LAMBDA_DIR/processor.js" "$LAMBDA_DIR/package.json" "$LAMBDA_DIR/package-lock.json" "$BUILD_DIR/"

echo "==> Installing production dependencies (npm ci)"
(cd "$BUILD_DIR" && npm ci --omit=dev --no-audit --no-fund)

echo "==> Discovering existing Lambda function's configured architecture"
ARCH="$(aws lambda get-function-configuration \
  --function-name "$LAMBDA_FUNCTION_NAME" \
  --query 'Architectures[0]' --output text)"
echo "    Function '$LAMBDA_FUNCTION_NAME' architecture: $ARCH"

case "$ARCH" in
  x86_64) KEEP_TARGET="rhel-openssl-3.0.x" ;;
  arm64)  KEEP_TARGET="linux-arm64-openssl-3.0.x" ;;
  *)
    echo "::error::Unrecognized Lambda architecture '$ARCH' - refusing to guess a Prisma binary target." >&2
    exit 1
    ;;
esac
echo "    Prisma binary target to keep: $KEEP_TARGET"

PRISMA_VERSION="$(node -p "require('$BUILD_DIR/node_modules/@prisma/client/package.json').version")"
echo "==> Generating Prisma Client (v$PRISMA_VERSION) against the repo's schema"
(cd "$BUILD_DIR" && npx --yes "prisma@${PRISMA_VERSION}" generate --schema="$REPO_ROOT/prisma/schema.prisma")

PRISMA_CLIENT_DIR="$BUILD_DIR/node_modules/.prisma/client"

echo "==> Pruning Prisma engines not needed by this deployment"
# Remove every generated native engine binary except the one matching the
# real Lambda architecture (drops the build runner's own "native" engine too).
find "$PRISMA_CLIENT_DIR" -maxdepth 1 -type f \( -iname "*query_engine*" -o -iname "*query-engine*" \) ! -iname "*${KEEP_TARGET}*" ! -iname "*_bg.*" -exec rm -v {} \;

# Remove WASM engines for database providers this project never uses
# (prisma/schema.prisma declares postgresql only).
find "$BUILD_DIR/node_modules/@prisma/client/runtime" -maxdepth 1 -type f \
  \( -iname "*mysql*" -o -iname "*sqlite*" -o -iname "*sqlserver*" -o -iname "*cockroachdb*" \) \
  -exec rm -v {} \;

echo "==> Verifying the kept engine is present"
if ! find "$PRISMA_CLIENT_DIR" -maxdepth 1 -iname "*${KEEP_TARGET}*" | grep -q .; then
  echo "::error::Expected Prisma engine for $KEEP_TARGET not found after generation/pruning." >&2
  exit 1
fi

echo "==> Zipping deployment package"
mkdir -p "$REPO_ROOT/.build"
rm -f "$ZIP_PATH"
(cd "$BUILD_DIR" && zip -X -r -q "$ZIP_PATH" index.js processor.js package.json node_modules)

SIZE_MB="$(du -m "$ZIP_PATH" | cut -f1)"
echo "==> Built $ZIP_PATH (${SIZE_MB} MB)"

if [[ -n "${GITHUB_OUTPUT:-}" ]]; then
  echo "zip_path=$ZIP_PATH" >> "$GITHUB_OUTPUT"
  echo "zip_filename=$(basename "$ZIP_PATH")" >> "$GITHUB_OUTPUT"
fi
