#!/usr/bin/env bash
#
# Sends scripts/deploy/ec2-remote-deploy.sh to the EC2 instance via AWS
# Systems Manager RunCommand, waits for it to finish, and surfaces its
# output/exit status. Never uses SSH, git pull, or EC2 Instance Connect -
# per project requirements, SSM RunCommand is the only transport.
#
# Why this is a separate script rather than inline YAML: SSM's async
# send-command/poll-for-result flow needs real error handling and readable
# logging, which is unwieldy to inline directly in a workflow step.

set -euo pipefail

: "${EC2_TAG_KEY:?EC2_TAG_KEY must be set}"
: "${EC2_TAG_VALUE:?EC2_TAG_VALUE must be set}"
: "${BUNDLE_S3_URI:?BUNDLE_S3_URI must be set}"
: "${APP_DIR:?APP_DIR must be set}"
: "${PM2_APP_NAME:?PM2_APP_NAME must be set}"
: "${APP_PORT:?APP_PORT must be set}"
: "${GIT_SHA:?GIT_SHA must be set}"

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
REMOTE_SCRIPT="$REPO_ROOT/scripts/deploy/ec2-remote-deploy.sh"

log() { echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $*"; }

log "Building remote command payload"
COMMAND_BODY="$(
  {
    echo "export BUNDLE_S3_URI='${BUNDLE_S3_URI}'"
    echo "export APP_DIR='${APP_DIR}'"
    echo "export PM2_APP_NAME='${PM2_APP_NAME}'"
    echo "export APP_PORT='${APP_PORT}'"
    cat "$REMOTE_SCRIPT"
  }
)"

PARAMS_JSON="$(jq -n --arg cmd "$COMMAND_BODY" '{commands: [$cmd]}')"

log "Sending SSM command to instances tagged ${EC2_TAG_KEY}=${EC2_TAG_VALUE}"
COMMAND_ID="$(aws ssm send-command \
  --document-name "AWS-RunShellScript" \
  --targets "Key=tag:${EC2_TAG_KEY},Values=${EC2_TAG_VALUE}" \
  --parameters "$PARAMS_JSON" \
  --comment "preread ec2 deploy ${GIT_SHA}" \
  --timeout-seconds 600 \
  --query 'Command.CommandId' \
  --output text)"
log "SSM CommandId: $COMMAND_ID"

log "Waiting for the command to reach a terminal state..."
STATUS="Pending"
for attempt in $(seq 1 60); do
  sleep 5
  INVOCATIONS="$(aws ssm list-command-invocations --command-id "$COMMAND_ID" --details --output json)"
  COUNT="$(echo "$INVOCATIONS" | jq '.CommandInvocations | length')"
  if [[ "$COUNT" -eq 0 ]]; then
    continue
  fi
  STATUS="$(echo "$INVOCATIONS" | jq -r '.CommandInvocations[0].Status')"
  case "$STATUS" in
    Success|Failed|Cancelled|TimedOut|Undeliverable)
      break
      ;;
    *)
      log "Status: $STATUS (attempt $attempt/60)"
      ;;
  esac
done

echo "---- SSM command output (${STATUS}) ----"
echo "$INVOCATIONS" | jq -r '.CommandInvocations[0].CommandPlugins[]? | "-- stdout --\n\(.Output)\n-- stderr --\n\(.StandardErrorContent // "")"' || true

if [[ "$STATUS" != "Success" ]]; then
  echo "::error::SSM deploy command finished with status $STATUS" >&2
  exit 1
fi

log "SSM deploy command completed successfully."
