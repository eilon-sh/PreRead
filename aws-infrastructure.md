# AWS Infrastructure Setup — Preread

Console-only guide for the PDF processing pipeline and app host in **us-east-1**. Do the steps top to bottom once.

**Flow:** Upload → S3 → SQS → Lambda → Bedrock → RDS  
**App:** Browser → nginx → Express (EC2) → S3 / RDS

**Disclaimer:** This guide uses the EC2 **public IP** over **HTTP**. It does **not** cover domain names, DNS, TLS certificates, HTTPS, or Route 53.

This document is the **minimal** path to a working pipeline and app host. It does **not** install or use extra packages from the demo instance such as Glances, GoAccess, httpd-tools, or similar optional monitoring/load-test tools. Those are not required for the app to run.

---

## Prerequisites

- AWS account with permission to create RDS, SQS, S3, IAM, Lambda, Bedrock, Secrets Manager, EC2
- Region: **us-east-1**
- Node.js 22+

`.env` skeleton (fill after creating resources):

```env
DATABASE_URL=postgresql://USER:PASSWORD@ENDPOINT:5432/preread_dev?sslmode=require
AWS_REGION=us-east-1
S3_UPLOAD_BUCKET=
```

Replace `ACCOUNT_ID` below with your 12-digit AWS account ID.

---

## 1. RDS

1. **RDS** → **Create database**
2. Engine: **PostgreSQL**
3. DB instance identifier: `preread-db`
4. Set master username and password
5. Instance: `db.t3.micro` (dev)
6. Storage: gp3, 20 GB
7. Connectivity: choose VPC; Public access as needed for your setup
8. Inbound security group: TCP **5432** from sources that must connect (app / Lambda)
9. Database name: `preread_dev`
10. **Create database**

Record the endpoint. Set:

```env
DATABASE_URL=postgresql://USER:PASSWORD@preread-db.XXXX.us-east-1.rds.amazonaws.com:5432/preread_dev?sslmode=require
```

Then:

```bash
npm run db:push
# or
npm run db:migrate
```

---

## 2. SQS

1. **SQS** → **Create queue** → Standard → name `preread-upload-queue-dlq` → Create
2. **Create queue** → Standard → name `preread-upload-queue`
3. Visibility timeout: **720** seconds
4. Dead-letter queue: `preread-upload-queue-dlq`, **maxReceiveCount: 5**
5. Create queue
6. **Access policy** → paste (replace `ACCOUNT_ID`):

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowS3SendMessage",
      "Effect": "Allow",
      "Principal": { "Service": "s3.amazonaws.com" },
      "Action": "sqs:SendMessage",
      "Resource": "arn:aws:sqs:us-east-1:ACCOUNT_ID:preread-upload-queue",
      "Condition": {
        "ArnLike": {
          "aws:SourceArn": "arn:aws:s3:::preread-uploads-ACCOUNT_ID-us-east-1"
        },
        "StringEquals": {
          "aws:SourceAccount": "ACCOUNT_ID"
        }
      }
    }
  ]
}
```

Set the access policy **before** the S3 event notification.

---

## 3. S3

### Upload bucket

1. **S3** → **Create bucket**
2. Name: `preread-uploads-ACCOUNT_ID-us-east-1`
3. Region: **us-east-1**
4. Block Public Access: leave enabled
5. Create bucket
6. **Properties** → **Event notifications** → **Create event notification**
   - Event types: **PUT** (`s3:ObjectCreated:Put`)
   - Destination: SQS → `preread-upload-queue`
7. Optional: **Management** → **Lifecycle** → expire objects after **14** days

### Artifacts bucket

1. Create bucket: `preread-deploy-artifacts-ACCOUNT_ID-us-east-1`
2. No event notifications
3. Optional: **Management** → **Lifecycle** → expire objects after **14** days

Set `S3_UPLOAD_BUCKET=preread-uploads-ACCOUNT_ID-us-east-1` in `.env`.

---

## 4. IAM

1. **IAM** → **Roles** → **Create role**
2. Trusted entity: AWS service → **Lambda**
3. Attach: `AWSLambdaBasicExecutionRole`
4. Role name: e.g. `preread-process-document-role`
5. Create role → **Add permissions** → **Create inline policy** → JSON
6. Name: `DocumentProcessorPolicy`
7. Paste (replace `ACCOUNT_ID`):

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["s3:GetObject"],
      "Resource": "arn:aws:s3:::preread-uploads-ACCOUNT_ID-us-east-1/*"
    },
    {
      "Effect": "Allow",
      "Action": ["sqs:ReceiveMessage", "sqs:DeleteMessage", "sqs:GetQueueAttributes"],
      "Resource": "arn:aws:sqs:us-east-1:ACCOUNT_ID:preread-upload-queue"
    },
    {
      "Effect": "Allow",
      "Action": ["bedrock:InvokeModel"],
      "Resource": "*"
    },
    {
      "Effect": "Allow",
      "Action": ["secretsmanager:GetSecretValue"],
      "Resource": "arn:aws:secretsmanager:us-east-1:ACCOUNT_ID:secret:preread/database-url-*"
    }
  ]
}
```

---

## 5. Lambda

1. **Lambda** → **Create function** → Author from scratch
2. Function name: `preread-process-document`
3. Runtime: **Node.js 22.x**
4. Architecture: x86_64
5. Execution role: the role from step 4
6. Create function
7. **Configuration** → **General configuration**:
   - Timeout: **120** seconds
   - Memory: **1024** MB
8. **Environment variables**:
   - `BEDROCK_MODEL_ID` = `global.anthropic.claude-sonnet-4-6`
   - `DATABASE_URL` = your Postgres URL with `sslmode=require`  
     **or** leave unset and use Secrets Manager (step 8)
9. Code is deployed via GitHub Actions (`.github/workflows/deploy-lambda.yml`), or upload a zip to the artifacts bucket and update function code

Handler: `index.handler`

---

## 6. Event source

1. **Lambda** → `preread-process-document` → **Configuration** → **Triggers** → **Add trigger**
2. Source: **SQS**
3. Queue: `preread-upload-queue`
4. Batch size: **1**
5. Report batch item failures: **Enabled**
6. Save

---

## 7. Bedrock

1. **Bedrock** → **Model access**
2. Enable access for **Anthropic Claude**
3. Wait until access is granted
4. Confirm Lambda env: `BEDROCK_MODEL_ID=global.anthropic.claude-sonnet-4-6`

---

## 8. Secrets

**Option A (current CI):** set `DATABASE_URL` directly on the Lambda function (and in GitHub secrets). Skip Secrets Manager.

**Option B:**

1. **Secrets Manager** → **Store a new secret** → Other type of secret
2. Secret value: full `DATABASE_URL` string (`...?sslmode=require`)
3. Secret name: `preread/database-url`
4. Copy the ARN → Lambda env `DATABASE_URL_SECRET_ARN`
5. Do **not** set `DATABASE_URL` on Lambda if using this path

---

## 9. EC2

One-time provisioning. Code updates go through GitHub Actions (`.github/workflows/deploy-ec2.yml`).

**Disclaimer (again):** no domain / DNS / HTTPS — set `BETTER_AUTH_URL` to `http://<PUBLIC_IP>`.

### Security group

1. **EC2** → **Security Groups** → **Create**
2. Name: e.g. `preread-app-sg`
3. Inbound:
   - TCP **80** from `0.0.0.0/0` (HTTP)
   - TCP **22** from your IP (optional, SSH)
4. Outbound: default (all)
5. On the **RDS** security group: allow TCP **5432** from `preread-app-sg`

### IAM instance profile

1. **IAM** → **Roles** → **Create role** → AWS service → **EC2**
2. Attach: `AmazonSSMManagedInstanceCore`
3. Inline policy (replace `ACCOUNT_ID`):

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["s3:PutObject"],
      "Resource": "arn:aws:s3:::preread-uploads-ACCOUNT_ID-us-east-1/*"
    },
    {
      "Effect": "Allow",
      "Action": ["s3:GetObject"],
      "Resource": "arn:aws:s3:::preread-deploy-artifacts-ACCOUNT_ID-us-east-1/ec2/*"
    },
    {
      "Effect": "Allow",
      "Action": ["s3:ListBucket"],
      "Resource": "arn:aws:s3:::preread-deploy-artifacts-ACCOUNT_ID-us-east-1",
      "Condition": {
        "StringLike": { "s3:prefix": ["ec2/*"] }
      }
    }
  ]
}
```

4. Role name: e.g. `preread-ec2-app`
5. Create an **instance profile** that uses this role (Console often does this when you attach the role to the instance)

### Launch instance

1. **EC2** → **Launch instance**
2. Name / tag: **`Name=preread-app`** (required for Deploy EC2)
3. AMI: Amazon Linux 2023 (or Ubuntu)
4. Instance type: e.g. `t3.small`
5. Key pair: optional if using SSM only
6. Network: same VPC as RDS; attach `preread-app-sg`
7. IAM instance profile: `preread-ec2-app`
8. Launch → note the **public IPv4**

### On the instance (SSM Session Manager or SSH)

Install Node 22, nginx, PM2. Create app dir:

```bash
sudo mkdir -p /opt/preread/app
sudo chown -R ssm-user:ssm-user /opt/preread   # or your SSH user
```

PM2 process name must be **`preread`**. App path must be **`/opt/preread/app`**.

First deploy: run **Actions → Deploy EC2** after GitHub secrets are set (section 11), or wait until after nginx.

---

## 10. nginx

Reverse proxy: Browser `:80` → Express/PM2 on `127.0.0.1:3000`.

**Not covered:** TLS, Let's Encrypt, custom domain, `server_name` for a real hostname.

1. Install nginx on the instance
2. Config file e.g. `/etc/nginx/conf.d/preread.conf`:

```nginx
server {
  listen 80 default_server;
  # If you add SSL later: listen 443 ssl; then http2 on; (nginx 1.25.1+; older: listen 443 ssl http2;)
  server_name _;
  server_tokens off;
  client_max_body_size 25m;

  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```

3. Enable and reload:

```bash
sudo nginx -t
sudo systemctl enable nginx
sudo systemctl reload nginx
```

Deploy EC2 does **not** install or update nginx.

---

## 11. Wire app / deploy

Local `.env`: `S3_UPLOAD_BUCKET`, `DATABASE_URL`, `AWS_REGION=us-east-1`.

**GitHub secrets:**

| Secret                                      | Used by                                                |
| ------------------------------------------- | ------------------------------------------------------ |
| `AWS_ROLE_ARN`                              | Deploy workflows (OIDC)                                |
| `AWS_REGION`                                | Both                                                   |
| `DEPLOY_ARTIFACTS_BUCKET`                   | Both (`preread-deploy-artifacts-ACCOUNT_ID-us-east-1`) |
| `DATABASE_URL`                              | Lambda + EC2                                           |
| `BEDROCK_MODEL_ID`                          | Lambda                                                 |
| `S3_UPLOAD_BUCKET`                          | EC2                                                    |
| `PORT`                                      | EC2 (e.g. `3000`)                                      |
| `BETTER_AUTH_URL`                           | EC2 — `http://<PUBLIC_IP>` (no domain in this guide)   |
| `BETTER_AUTH_SECRET`                        | EC2                                                    |
| `CSRF_SECRET`                               | EC2                                                    |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | EC2 (optional)                                         |
| `RESEND_API_KEY`                            | EC2 (optional)                                         |

Workflows: `.github/workflows/deploy-lambda.yml`, `.github/workflows/deploy-ec2.yml`.

After first **Deploy EC2**: open `http://<PUBLIC_IP>`.

---

## Done check

1. `http://<PUBLIC_IP>` loads the app
2. Upload a PDF in the app
3. Object appears in the upload bucket
4. SQS queue depth returns to 0
5. Lambda CloudWatch logs show a successful run (`/aws/lambda/preread-process-document`)
6. DB document `processingStatus` is `ready`
