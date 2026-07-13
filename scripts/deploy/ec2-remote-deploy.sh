#!/usr/bin/env bash
#
# Runs ON the EC2 instance itself, invoked via AWS Systems Manager
# RunCommand (AWS-RunShellScript) - never via SSH, never via git pull.
#
# The GitHub Actions workflow sends this script's contents as the SSM
# command payload, prefixed with `export` lines for the variables below
# (values are only known at workflow-run time: the S3 key of this run's
# bundle, etc). AWS_LAMBDA-esque "guessing" is avoided the same way as the
# Lambda build: nothing here is copied over from the CI runner's own
# environment - it downloads, extracts, and rebuilds entirely using the
# instance's own OS/architecture and its own IAM instance profile.
#
# What this script deliberately does NOT touch in $APP_DIR, and why:
#   .env          - runtime secrets/config for this specific instance; never
#                    part of the git-tracked bundle, so extraction can't
#                    overwrite it as long as we only replace known
#                    source directories (see below).
#   node_modules  - rebuilt fresh by `npm ci` below; no need to preserve.
#   anything else - any other file an operator placed in $APP_DIR (e.g. a
#                    stray uploads/ directory, though the current codebase's
#                    multer.memoryStorage() means one shouldn't exist) is
#                    left alone, because this script only ever removes the
#                    three specific directories it's about to replace.

set -euo pipefail

: "${BUNDLE_S3_URI:?BUNDLE_S3_URI must be set (s3://bucket/key of the new app-<sha>.tar.gz)}"
: "${APP_DIR:?APP_DIR must be set (e.g. /opt/preread/app)}"
: "${PM2_APP_NAME:?PM2_APP_NAME must be set (e.g. preread)}"
: "${APP_PORT:?APP_PORT must be set (e.g. 3000)}"

log() { echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $*"; }

TMP_BUNDLE="$(mktemp /tmp/preread-deploy-XXXXXX.tar.gz)"
cleanup() { rm -f "$TMP_BUNDLE"; }
trap cleanup EXIT

log "Deploying $BUNDLE_S3_URI to $APP_DIR"

if [[ ! -d "$APP_DIR" ]]; then
  echo "ERROR: $APP_DIR does not exist. This script only updates an existing" >&2
  echo "deployment - it does not provision a new one." >&2
  exit 1
fi

if [[ ! -f "$APP_DIR/.env" ]]; then
  echo "ERROR: $APP_DIR/.env not found. Refusing to deploy - a missing .env" >&2
  echo "almost certainly means this is the wrong directory." >&2
  exit 1
fi

log "Downloading bundle from S3..."
aws s3 cp "$BUNDLE_S3_URI" "$TMP_BUNDLE"

log "Removing previous src/, public/, prisma/ (leaving .env and node_modules untouched)..."
rm -rf "${APP_DIR:?}/src" "${APP_DIR:?}/public" "${APP_DIR:?}/prisma"

log "Extracting new bundle into $APP_DIR..."
tar -xzf "$TMP_BUNDLE" -C "$APP_DIR"

log "Installing dependencies (npm ci, includes postinstall: prisma generate)..."
cd "$APP_DIR"
npm ci

log "Restarting PM2 process '$PM2_APP_NAME'..."
if pm2 describe "$PM2_APP_NAME" >/dev/null 2>&1; then
  pm2 restart "$PM2_APP_NAME" --update-env
else
  echo "ERROR: PM2 process '$PM2_APP_NAME' not found. This script only" >&2
  echo "restarts an already-running process - it does not start one from" >&2
  echo "scratch, since that would require knowing the original pm2 start" >&2
  echo "invocation, which is out of scope for a code deploy." >&2
  exit 1
fi
pm2 save

log "Waiting for the app to report healthy on port $APP_PORT..."
HEALTHY="false"
for attempt in $(seq 1 15); do
  if curl -fsS "http://127.0.0.1:${APP_PORT}/" -o /dev/null; then
    HEALTHY="true"
    break
  fi
  sleep 2
done

if [[ "$HEALTHY" != "true" ]]; then
  echo "ERROR: App did not respond on port $APP_PORT after restart." >&2
  echo "---- pm2 logs (last 50 lines) ----" >&2
  pm2 logs "$PM2_APP_NAME" --lines 50 --nostream >&2 || true
  exit 1
fi

log "Deploy successful. $PM2_APP_NAME is running and responding on port $APP_PORT."
