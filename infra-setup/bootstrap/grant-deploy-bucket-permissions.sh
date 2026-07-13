#!/usr/bin/env bash
#
# One-time, manually-run bootstrap step. Not part of any GitHub Actions workflow.
#
# Grants two EXISTING roles the minimum S3 permissions needed to use one new,
# specifically-named deployment artifacts bucket
# (preread-deploy-artifacts-<account>-<region>). No IAM permissions are ever
# granted to either role, so neither can widen its own access - only a human
# with iam:PutRolePolicy on these roles can run this script.
#
# Two roles need access, for two different reasons:
#   1. The GitHub OIDC deploy role - uploads build artifacts (both lambda/*
#      and ec2/* prefixes), and (once, for bootstrap-deploy-bucket.yml)
#      creates/configures the bucket itself.
#   2. The EC2 instance's own IAM instance profile role - because AWS Systems
#      Manager RunCommand executes shell commands using the target instance's
#      own attached role, NOT the caller's role. The instance needs to
#      download the ec2/* deployment bundle itself. It only gets read access,
#      scoped to the ec2/ prefix - it can never read lambda/ artifacts or
#      write anything.
#
# Usage:
#   ./grant-deploy-bucket-permissions.sh <github-deploy-role-name> <ec2-instance-role-name> [aws-region]
#
# Requires AWS CLI credentials with permission to run iam:PutRolePolicy on
# both target roles (typically an account admin), configured via your normal
# AWS credential chain (env vars, SSO, profile, etc). Not run by CI.

set -euo pipefail

DEPLOY_ROLE_NAME="${1:-}"
EC2_ROLE_NAME="${2:-}"
REGION="${3:-us-east-1}"

if [[ -z "$DEPLOY_ROLE_NAME" || -z "$EC2_ROLE_NAME" ]]; then
  echo "Usage: $0 <github-deploy-role-name> <ec2-instance-role-name> [aws-region]" >&2
  echo "Example: $0 preread-github-actions-deploy-role preread-ec2-app us-east-1" >&2
  exit 1
fi

echo "==> Resolving AWS account ID for the current credentials..."
ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text)"
echo "    Account: $ACCOUNT_ID"

BUCKET_NAME="preread-deploy-artifacts-${ACCOUNT_ID}-${REGION}"
BUCKET_ARN="arn:aws:s3:::${BUCKET_NAME}"

echo "==> Target bucket:       $BUCKET_NAME"
echo "==> GitHub deploy role:  $DEPLOY_ROLE_NAME"
echo "==> EC2 instance role:   $EC2_ROLE_NAME"

echo "==> Verifying both roles exist..."
aws iam get-role --role-name "$DEPLOY_ROLE_NAME" >/dev/null
aws iam get-role --role-name "$EC2_ROLE_NAME" >/dev/null

DEPLOY_POLICY_DOC="$(mktemp)"
EC2_POLICY_DOC="$(mktemp)"
trap 'rm -f "$DEPLOY_POLICY_DOC" "$EC2_POLICY_DOC"' EXIT

cat > "$DEPLOY_POLICY_DOC" <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "CreateAndConfigureDeployBucketOnly",
      "Effect": "Allow",
      "Action": [
        "s3:CreateBucket",
        "s3:PutBucketPublicAccessBlock",
        "s3:PutEncryptionConfiguration",
        "s3:PutLifecycleConfiguration"
      ],
      "Resource": "${BUCKET_ARN}"
    },
    {
      "Sid": "UseDeployBucketOngoing",
      "Effect": "Allow",
      "Action": [
        "s3:ListBucket"
      ],
      "Resource": "${BUCKET_ARN}"
    },
    {
      "Sid": "ReadWriteDeployArtifacts",
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:GetObject"
      ],
      "Resource": "${BUCKET_ARN}/*"
    }
  ]
}
EOF

cat > "$EC2_POLICY_DOC" <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "ReadOwnDeploymentBundlesOnly",
      "Effect": "Allow",
      "Action": [
        "s3:GetObject"
      ],
      "Resource": "${BUCKET_ARN}/ec2/*"
    }
  ]
}
EOF

echo ""
echo "==> Policy for $DEPLOY_ROLE_NAME:"
cat "$DEPLOY_POLICY_DOC"
echo ""
echo "==> Attaching inline policy 'preread-deploy-bucket-access' to $DEPLOY_ROLE_NAME..."
aws iam put-role-policy \
  --role-name "$DEPLOY_ROLE_NAME" \
  --policy-name "preread-deploy-bucket-access" \
  --policy-document "file://${DEPLOY_POLICY_DOC}"

echo ""
echo "==> Policy for $EC2_ROLE_NAME:"
cat "$EC2_POLICY_DOC"
echo ""
echo "==> Attaching inline policy 'preread-deploy-bucket-read' to $EC2_ROLE_NAME..."
aws iam put-role-policy \
  --role-name "$EC2_ROLE_NAME" \
  --policy-name "preread-deploy-bucket-read" \
  --policy-document "file://${EC2_POLICY_DOC}"

echo ""
echo "==> Done. No IAM permissions were granted to either role - only S3 actions"
echo "    scoped to $BUCKET_ARN (and its ec2/ prefix for the instance role)."
echo ""
echo "Next steps:"
echo "  1. In GitHub, add a repository Variable:"
echo "       DEPLOY_ARTIFACTS_BUCKET = ${BUCKET_NAME}"
echo "  2. Run the 'Bootstrap Deploy Bucket' workflow from the Actions tab"
echo "     (workflow_dispatch) to actually create and configure the bucket."
