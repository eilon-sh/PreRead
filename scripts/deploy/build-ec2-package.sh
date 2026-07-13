#!/usr/bin/env bash
#
# Builds the deployable source bundle for the Express app (EC2 target).
#
# Ships SOURCE ONLY - no node_modules. `npm ci` (and its postinstall
# `prisma generate` hook, see root package.json) runs on the EC2 instance
# itself via the SSM remote-deploy script, not on the GitHub Actions runner.
# This is deliberate: Prisma's generated query engine must match the machine
# it runs on, and running install+generate directly on the instance means
# Prisma's default "native" binary target is always correct with no need to
# guess or discover the instance's OS/architecture.
#
# Included (confirmed by grep to be everything src/server.js actually needs
# at runtime): src/, public/, prisma/schema.prisma, package.json,
# package-lock.json. Excludes test/, docs/, openapi.yaml (not read by the
# app at runtime), lambda/ (separate deployable), and anything
# environment/secret-specific (.env is never part of this repo's git tree).

set -euo pipefail

: "${GIT_SHA:?GIT_SHA must be set}"

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ARCHIVE_PATH="$REPO_ROOT/.build/app-${GIT_SHA}.tar.gz"

echo "==> Building EC2 source bundle"
mkdir -p "$REPO_ROOT/.build"
rm -f "$ARCHIVE_PATH"

cd "$REPO_ROOT"
tar -czf "$ARCHIVE_PATH" \
  src \
  public \
  prisma/schema.prisma \
  package.json \
  package-lock.json

SIZE_KB="$(du -k "$ARCHIVE_PATH" | cut -f1)"
echo "==> Built $ARCHIVE_PATH (${SIZE_KB} KB)"

if [[ -n "${GITHUB_OUTPUT:-}" ]]; then
  echo "archive_path=$ARCHIVE_PATH" >> "$GITHUB_OUTPUT"
  echo "archive_filename=$(basename "$ARCHIVE_PATH")" >> "$GITHUB_OUTPUT"
fi
