# AWS — run Preread

Region: **`us-east-1`**.

```
Browser → EC2 (Express) → S3 → SQS → Lambda → Bedrock
                ↓                         ↓
               RDS ←──────────────────────┘
```

---

## Services to create

| # | Service | Name / pattern | Required |
|---|---------|----------------|----------|
| 1 | RDS PostgreSQL 15+ | e.g. `preread-db` / DB `preread_dev` | Yes |
| 2 | SQS Standard | e.g. `preread-upload-queue` | Yes |
| 3 | S3 upload bucket | `preread-uploads-{AccountId}-us-east-1` | Yes |
| 4 | IAM Lambda role | trusted entity: Lambda | Yes |
| 5 | Lambda | `preread-process-document` | Yes |
| 6 | Bedrock | Claude inference profile | Yes |
| 7 | Secrets Manager | `preread/database-url` | Optional |
| 8 | EC2 | tag `Name=preread-app` | Prod |
| 9 | S3 artifacts bucket | `preread-deploy-artifacts-{AccountId}-{region}` | CI |

**First-time order:** 1 → 6 → 2 → 3 → 4 → 5 → (7) → `.env` / GitHub secrets → (9 + bootstrap) → (8 or local `npm run dev`).

---

## 1. RDS

| Setting | Value |
|---------|-------|
| Engine | PostgreSQL **15+** |
| Instance | `db.t3.micro` (dev), gp3 ~20 GB |
| DB name | `preread_dev` |
| Public access | Yes (local/dev), or Lambda in VPC if private |
| SG inbound | TCP **5432** from your IP; from EC2 SG / Lambda SG (prod) |

```env
DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/preread_dev?sslmode=require
```

```bash
npm run db:push
# or: npm run db:migrate
```

---

## 2. SQS

1. Create queue → **Standard**
2. Visibility timeout: **120** seconds
3. Access policy (before S3 notification):

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowS3SendMessage",
      "Effect": "Allow",
      "Principal": { "Service": "s3.amazonaws.com" },
      "Action": "sqs:SendMessage",
      "Resource": "arn:aws:sqs:us-east-1:ACCOUNT_ID:QUEUE_NAME",
      "Condition": {
        "ArnEquals": {
          "aws:SourceArn": "arn:aws:s3:::preread-uploads-ACCOUNT_ID-us-east-1"
        }
      }
    }
  ]
}
```

---

## 3. S3 — upload bucket

1. Bucket name: `preread-uploads-{AccountId}-us-east-1`
2. Block Public Access: **on**
3. Event notification:
   - Event: `s3:ObjectCreated:Put`
   - Destination: SQS queue from §2
4. App env: `S3_UPLOAD_BUCKET=<bucket name>`

**CI artifacts bucket** (no events): `preread-deploy-artifacts-{AccountId}-{region}` — see §10.

---

## 4. IAM — Lambda role

1. Roles → Create → trusted entity: **Lambda**
2. Attach: `AWSLambdaBasicExecutionRole`
3. Inline policy `DocumentProcessorPolicy`:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["s3:GetObject"],
      "Resource": "arn:aws:s3:::preread-uploads-ACCOUNT-us-east-1/*"
    },
    {
      "Effect": "Allow",
      "Action": ["sqs:ReceiveMessage", "sqs:DeleteMessage", "sqs:GetQueueAttributes"],
      "Resource": "arn:aws:sqs:us-east-1:ACCOUNT:QUEUE_NAME"
    },
    {
      "Effect": "Allow",
      "Action": ["bedrock:InvokeModel", "bedrock:CallWithBearerToken"],
      "Resource": "*"
    },
    {
      "Effect": "Allow",
      "Action": ["secretsmanager:GetSecretValue"],
      "Resource": "arn:aws:secretsmanager:us-east-1:ACCOUNT:secret:preread/database-url-*"
    }
  ]
}
```

**Express / EC2** (instance role or local `aws configure`):

```json
{ "Effect": "Allow", "Action": ["s3:PutObject"], "Resource": "arn:aws:s3:::preread-uploads-*/*" }
```

Do **not** put `AWS_ACCESS_KEY_ID` in `.env`.

---

## 5. Lambda

| Setting | Value |
|---------|-------|
| Name | `preread-process-document` |
| Runtime | Node.js **22.x** |
| Handler | `index.handler` |
| Timeout | **120** s |
| Memory | **1024** MB |
| Role | role from §4 |

**Env:**

| Variable | Value |
|----------|-------|
| `BEDROCK_MODEL_ID` | `global.anthropic.claude-sonnet-4-6` |
| `BEDROCK_TEMPERATURE` | `0` |
| `DATABASE_URL` | same as app, **or** |
| `DATABASE_URL_SECRET_ARN` | Secrets Manager ARN |

**Trigger:** SQS → batch size **10** → **Report batch item failures** on.

**Deploy:** GitHub Actions **Deploy Lambda**, or zip from `lambda/process-document/`.

**Private RDS:** Lambda VPC (subnets + SG) + NAT/VPC endpoints for S3, Bedrock, Secrets Manager. RDS SG: allow 5432 from Lambda SG.

---

## 6. Bedrock

1. Model access → enable **Anthropic Claude**
2. Use inference profile ID, e.g. `global.anthropic.claude-sonnet-4-6`
3. Set `BEDROCK_MODEL_ID` on Lambda and as GitHub secret

---

## 7. Secrets Manager (optional)

| Setting | Value |
|---------|-------|
| Secret name | `preread/database-url` |
| Value | full `DATABASE_URL` string |
| Lambda env | `DATABASE_URL_SECRET_ARN=<arn>` |

```bash
aws secretsmanager put-secret-value \
  --secret-id preread/database-url \
  --secret-string "$DATABASE_URL" \
  --region us-east-1
```

---

## 8. EC2 (prod app)

| Item | Requirement |
|------|-------------|
| Tag | `Name=preread-app` (required by Deploy EC2) |
| SG inbound | **80** (and **443** if TLS); **22** if needed |
| Instance profile | `s3:PutObject` on upload bucket; `s3:GetObject` on artifacts `ec2/*`; `AmazonSSMManagedInstanceCore` |
| Runtime | Node **22**, nginx **80→3000**, PM2 process **`preread`**, app dir **`/opt/preread/app`** |
| RDS SG | Allow **5432** from EC2 SG |

Code updates: workflow **Deploy EC2** (SSM). Does not create the instance.

Optional: Elastic IP → update `BETTER_AUTH_URL`.

---

## 9. Local `.env`

Copy `.env.example`. Minimum:

```env
DATABASE_URL=postgresql://...
AWS_REGION=us-east-1
S3_UPLOAD_BUCKET=preread-uploads-ACCOUNT-us-east-1
BETTER_AUTH_SECRET=...
CSRF_SECRET=...
BETTER_AUTH_URL=http://localhost:3000
```

```bash
aws configure
npm install
npm run db:push
npm run dev
```

Prod validation also requires non-localhost `BETTER_AUTH_URL` and real secrets.

---

## 10. GitHub Actions

### One-time bootstrap

```bash
./infra-setup/bootstrap/grant-deploy-bucket-permissions.sh \
  <github-deploy-role-name> <ec2-instance-role-name> us-east-1
```

1. Run workflow **Bootstrap Deploy Bucket**
2. Set secret `DEPLOY_ARTIFACTS_BUCKET=preread-deploy-artifacts-…`

### Secrets

| Secret | Deploy Lambda | Deploy EC2 |
|--------|:-------------:|:----------:|
| `AWS_ROLE_ARN` | x | x |
| `AWS_REGION` | x | x |
| `DEPLOY_ARTIFACTS_BUCKET` | x | x |
| `DATABASE_URL` | x | x |
| `BEDROCK_MODEL_ID` | x | |
| `S3_UPLOAD_BUCKET` | | x |
| `PORT` | | x |
| `BETTER_AUTH_URL` | | x |
| `BETTER_AUTH_SECRET` | | x |
| `CSRF_SECRET` | | x |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | | optional |
| `RESEND_API_KEY` | | optional |

EC2 deploy also writes `NODE_ENV=production`, `TRUST_PROXY=true`, `RESEND_FROM_EMAIL=onboarding@resend.dev`.

### Workflows

| Workflow | Trigger |
|----------|---------|
| Deploy Lambda | push `lambda/**` or manual |
| Deploy EC2 | push `src/` / `public/` / `prisma/` / `package*` or manual |
| Bootstrap Deploy Bucket | manual |

---

## Smoke test

1. Upload a PDF
2. Object appears in upload S3
3. SQS drains
4. CloudWatch: `/aws/lambda/preread-process-document`
5. Document status `ready` in DB

```bash
aws lambda get-function --function-name preread-process-document --region us-east-1
aws logs tail /aws/lambda/preread-process-document --follow --region us-east-1
```

| Symptom | Check |
|---------|-------|
| Upload OK, Lambda never runs | S3→SQS notification; queue policy |
| Bedrock 403 | Model access; inference profile ID |
| Can't reach DB from Lambda | RDS public + SG, or Lambda VPC + SG |
| `S3_UPLOAD_BUCKET is not configured` | `.env` / GitHub secret |
| Stuck `processing` | Lambda CloudWatch logs |

---

## Project files

| Path | Purpose |
|------|---------|
| `.github/workflows/deploy-lambda.yml` | Lambda deploy |
| `.github/workflows/deploy-ec2.yml` | EC2 deploy |
| `.github/workflows/bootstrap-deploy-bucket.yml` | Artifacts bucket |
| `infra-setup/bootstrap/grant-deploy-bucket-permissions.sh` | Bootstrap IAM |
| `lambda/process-document/` | Processor code |
| `.env.example` | Env template |
| `openapi.yaml` | API contract |
