# AWS Infrastructure Guide - Preread Project

Comprehensive technical documentation for building and maintaining all AWS services used by the **Preread** application - PDF upload, asynchronous processing, vocabulary extraction via **Amazon Bedrock**, and storage in **RDS PostgreSQL**.

---

## Table of Contents

1. [Overview](#1-overview)
2. [Prerequisites](#2-prerequisites)
3. [Amazon S3](#3-amazon-s3)
4. [Amazon SQS](#4-amazon-sqs)
5. [AWS Lambda](#5-aws-lambda)
6. [IAM Role and Policies](#6-iam-role-and-policies)
7. [AWS Secrets Manager](#7-aws-secrets-manager)
8. [Amazon RDS (PostgreSQL)](#8-amazon-rds-postgresql)
9. [EC2 Security Groups (VPC)](#9-ec2-security-groups-vpc)
10. [Amazon Bedrock](#10-amazon-bedrock)
11. [Lambda Event Source Mapping](#11-lambda-event-source-mapping)
12. [AWS CloudFormation / Infrastructure](#12-aws-cloudformation--infrastructure)
13. [Environment Variables](#13-environment-variables)
14. [Deploy Process (GitHub Actions)](#14-deploy-process-github-actions)
15. [Application Deployment to EC2](#15-application-deployment-to-ec2)
16. [Diagnostics and Troubleshooting](#16-diagnostics-and-troubleshooting)
17. [Cost and Security](#17-cost-and-security)

---

## 1. Overview

### What does the application do?

**Preread** is an Express application that lets users upload PDF files. After upload:

1. The server saves a `Document` record in the DB with `processingStatus: processing`
2. The server uploads the PDF to **S3** (`PutObject`)
3. An **S3 Event Notification** sends a message to **SQS**
4. **Lambda** (`preread-process-document`) is invoked from the queue
5. Lambda reads the PDF from S3, sends it to **Bedrock** for word extraction, and saves to **RDS** via Prisma
6. Status is updated to `ready` or `failed`

### Architecture diagram

```mermaid
flowchart LR
  subgraph Client["Browser / User"]
    U[Upload PDF]
  end

  subgraph App["Express App (EC2 / local)"]
    API[documents.controller]
    S3SVC[s3Service.js]
    DB1[(Prisma / RDS)]
  end

  subgraph AWS["AWS us-east-1"]
  direction TB
    BUCKET[(S3 Upload Bucket<br/>preread-uploads-...)]
    QUEUE[SQS UploadQueue]
    LAMBDA[Lambda<br/>preread-process-document]
    BEDROCK[Amazon Bedrock]
    SECRET[Secrets Manager<br/>preread/database-url]
    ARTIFACTS[(S3 Artifacts Bucket<br/>preread-artifacts-...)]
    RDS[(RDS PostgreSQL)]
  end

  U --> API
  API --> DB1
  API --> S3SVC
  S3SVC -->|PutObject| BUCKET
  BUCKET -->|s3:ObjectCreated:Put| QUEUE
  QUEUE -->|Event Source Mapping| LAMBDA
  LAMBDA -->|GetObject| BUCKET
  LAMBDA --> BEDROCK
  LAMBDA --> SECRET
  LAMBDA --> RDS
  ARTIFACTS -.->|Lambda zip| LAMBDA
```

### Processing infrastructure resources (S3 / SQS / Lambda)

The following resources are managed in AWS (Console / CLI). Application code is deployed via GitHub Actions.

| Logical ID / Name              | AWS Type                          | Physical name / default                    |
| ------------------------------ | --------------------------------- | ------------------------------------------ |
| `UploadQueue`                  | `AWS::SQS::Queue`                 | `preread-docs-UploadQueue-XXXXX`           |
| `UploadQueuePolicy`            | `AWS::SQS::QueuePolicy`           | -                                          |
| `UploadBucket`                 | `AWS::S3::Bucket`                 | `preread-uploads-{AccountId}-{region}`     |
| `ProcessDocumentRole`          | `AWS::IAM::Role`                  | `preread-docs-ProcessDocumentRole-XXXXX`   |
| `ProcessDocumentFunction`      | `AWS::Lambda::Function`           | `preread-process-document`                 |
| `ProcessDocumentEventSource`   | `AWS::Lambda::EventSourceMapping` | Auto-generated UUID                        |

> **Important:** **RDS** is not part of the processing resources - create it separately. Update `DATABASE_URL` in Secrets Manager (or in Lambda env) after changing the DB.

### Stack name

```
preread-docs
```

---

## 2. Prerequisites

### AWS account

| Requirement              | Details                                                        |
| ------------------------ | -------------------------------------------------------------- |
| Active AWS account       | With permissions to create S3, SQS, Lambda, IAM, Secrets Manager, Bedrock |
| Region                   | **`us-east-1`** (project default)                              |
| AWS credentials for S3   | **Not in `.env`**. Local dev: AWS CLI profile (`aws configure`). On EC2: instance IAM role. |

### Local tools

| Tool                    | Usage                              |
| ----------------------- | ---------------------------------- |
| **Node.js** 22+         | Running the application            |
| **npm**                 | `npm install` in project root      |
| **AWS CLI** (optional)  | Manual diagnostics, testing        |
| **Prisma CLI**          | DB migrations: `npm run db:migrate` / `db:push` |
| **GitHub Actions**      | Deploy to Lambda and EC2 (see sections 14–15) |

### Recommended IAM permissions for developers (minimum for manual deploy / diagnostics)

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "cloudformation:*",
        "s3:*",
        "sqs:*",
        "lambda:*",
        "iam:CreateRole",
        "iam:DeleteRole",
        "iam:PutRolePolicy",
        "iam:AttachRolePolicy",
        "iam:DetachRolePolicy",
        "iam:DeleteRolePolicy",
        "iam:GetRole",
        "iam:PassRole",
        "secretsmanager:*",
        "sts:GetCallerIdentity",
        "bedrock:InvokeModel",
        "logs:*"
      ],
      "Resource": "*"
    }
  ]
}
```

> In production - restrict permissions according to least privilege.

### `.env` file

Copy from `.env.example` and fill in at least:

```env
DATABASE_URL=postgresql://USER:PASSWORD@your-instance.region.rds.amazonaws.com:5432/preread_dev?sslmode=require
AWS_REGION=us-east-1
S3_UPLOAD_BUCKET=   # filled after first deploy
```

---

## 3. Amazon S3

### Role in the project

Two buckets:

| Bucket               | Name (default)                            | Purpose                                                      |
| -------------------- | ----------------------------------------- | ------------------------------------------------------------ |
| **Upload Bucket**    | `preread-uploads-{AccountId}-us-east-1`   | Storage for PDFs uploaded by users                           |
| **Artifacts Bucket** | `preread-artifacts-{AccountId}-us-east-1` | Lambda code zip (not in CFN template - created by deploy script) |

### Upload flow

```12:28:src/services/s3Service.js
export function buildDocumentS3Key(userId, filename) {
  const base = path.basename(filename || 'document.pdf', '.pdf');
  const normalized = base.replace(/[^a-zA-Z0-9-_]/g, '_').slice(0, 80) || 'document';
  return `${userId}-${Date.now()}-${normalized}.pdf`;
}

export async function uploadPdfToS3({ key, buffer }) {
  // ...
  await s3.send(
    new PutObjectCommand({
      Bucket: config.s3UploadBucket,
      Key: key,
      Body: buffer,
      ContentType: 'application/pdf',
    }),
  );
}
```

Key format: `{userId}-{timestamp}-{normalized-filename}.pdf`

### Manual creation in AWS Console

#### Upload Bucket

1. **S3** → **Create bucket**
2. **Bucket name:** `preread-uploads-123456789012-us-east-1` (globally unique)
3. **Region:** `us-east-1`
4. **Block Public Access:** leave **enabled** (access only via IAM)
5. **Create bucket**
6. After creating SQS + Queue Policy - **Properties** → **Event notifications** → **Create event notification**:
   - **Event types:** `All object create events` or specifically `PUT`
   - **Destination:** SQS queue → select `UploadQueue`
7. **Permissions** - the Queue Policy (SQS section) allows S3 to send messages

#### Artifacts Bucket

1. **Create bucket** named `preread-artifacts-{AccountId}-us-east-1`
2. No event notifications needed
3. Used only for Lambda `UpdateFunctionCode`

### CloudFormation equivalent

```yaml
UploadBucket:
  Type: AWS::S3::Bucket
  DependsOn: UploadQueuePolicy
  Properties:
    BucketName: !Ref UploadBucketName
    NotificationConfiguration:
      QueueConfigurations:
        - Event: s3:ObjectCreated:Put
          Queue: !GetAtt UploadQueue.Arn
```

### IAM - who needs access?

| Service / application        | Actions                                            | Resource                           |
| ---------------------------- | -------------------------------------------------- | ---------------------------------- |
| Express App (IAM role / local AWS profile) | `s3:PutObject`                                     | `arn:aws:s3:::preread-uploads-*/*` |
| Lambda `ProcessDocumentRole` | `s3:GetObject`                                     | `arn:aws:s3:::preread-uploads-*/*` |
| Deploy script                | `s3:CreateBucket`, `s3:PutObject`, `s3:HeadBucket` | artifacts bucket                   |

### Important configuration values

| Parameter                   | Value                                                                         |
| --------------------------- | ----------------------------------------------------------------------------- |
| Event                       | `s3:ObjectCreated:Put` only (no separate multipart complete - `PutObject` is enough) |
| Content-Type on upload      | `application/pdf`                                                             |
| `S3_UPLOAD_BUCKET` in `.env`| Must match the actual bucket name                                             |

### Common pitfalls

| Issue                              | Cause                                             | Solution                                                               |
| ---------------------------------- | ------------------------------------------------- | ---------------------------------------------------------------------- |
| Upload works but Lambda doesn't run| No event notification or missing Queue Policy     | Ensure `DependsOn: UploadQueuePolicy` before the bucket in CFN         |
| `Access Denied` on app upload      | Active credentials lack `s3:PutObject`            | Add policy to EC2 instance role or local AWS CLI profile              |
| Bucket name taken                  | S3 names are global                               | Change `UploadBucketName` / `S3_UPLOAD_BUCKET`                         |
| Circular dependency in CFN         | Using `!GetAtt UploadBucket.Arn` in Queue Policy  | Project uses `!Sub 'arn:aws:s3:::${UploadBucketName}'` - keep it that way |

---

## 4. Amazon SQS

### Role in the project

Intermediate queue between S3 and Lambda. Each `PutObject` to the upload bucket creates a message with S3 object metadata (S3 Event Notification format).

### Manual creation in AWS Console

1. **SQS** → **Create queue**
2. **Type:** Standard
3. **Name:** e.g. `preread-upload-queue`
4. **Visibility timeout:** **`120` seconds** (must be ≥ Lambda timeout)
5. **Create queue**
6. **Access policy** → add policy allowing S3 to send:

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

7. **Required:** create the Queue Policy **before** configuring the S3 notification

### CloudFormation equivalent

```yaml
UploadQueue:
  Type: AWS::SQS::Queue
  Properties:
    VisibilityTimeout: 120

UploadQueuePolicy:
  Type: AWS::SQS::QueuePolicy
  Properties:
    Queues: [!Ref UploadQueue]
    PolicyDocument:
      # ... AllowS3SendMessage statement
```

### IAM - Lambda role

```yaml
Action:
  - sqs:ReceiveMessage
  - sqs:DeleteMessage
  - sqs:GetQueueAttributes
Resource: !GetAtt UploadQueue.Arn
```

### Message structure (what Lambda expects)

```javascript
// processor.mjs - parseS3FromRecord
const body = JSON.parse(record.body);
const s3Record = body.Records[0];
// s3Record.s3.bucket.name, s3Record.s3.object.key
```

### Common pitfalls

| Issue                              | Solution                                                    |
| ---------------------------------- | ----------------------------------------------------------- |
| Messages stuck In Flight           | Increase `VisibilityTimeout` or shorten Lambda processing   |
| Messages in DLQ (if configured)    | Check Lambda CloudWatch Logs                                |
| S3 notification fails validation   | Queue Policy must exist **before** bucket notification      |

---

## 5. AWS Lambda

### Role in the project

Function `preread-process-document` - processes one PDF (or a batch of up to 10) per invocation.

### Parameters from the project

| Parameter        | Value                                           |
| ---------------- | ----------------------------------------------- |
| **FunctionName** | `preread-process-document`                      |
| **Runtime**      | `nodejs22.x`                                    |
| **Handler**      | `index.handler`                                 |
| **Timeout**      | `120` seconds                                   |
| **Memory**       | `1024` MB                                       |
| **VPC**          | **None** (in current template - Lambda outside VPC) |

### Environment variables (in Lambda)

| Variable                  | Source        | Default value                                    |
| ------------------------- | ------------- | ------------------------------------------------ |
| `BEDROCK_MODEL_ID`        | CFN Parameter | `global.anthropic.claude-sonnet-4-20250514-v1:0` |
| `BEDROCK_TEMPERATURE`     | CFN           | `0`                                              |
| `DATABASE_URL_SECRET_ARN` | CFN Parameter | ARN of `preread/database-url`                    |

> In code (`processor.js`) the default model is `global.anthropic.claude-sonnet-4-20250514-v1:0` - ensure `BEDROCK_MODEL_ID` in Lambda matches the model you requested in Bedrock Console (inference profile, not direct foundation model ID).

### Manual creation in AWS Console

1. **Lambda** → **Create function**
2. **Author from scratch**
3. **Function name:** `preread-process-document`
4. **Runtime:** Node.js 22.x
5. **Architecture:** x86_64
6. **Execution role:** select / create role with permissions (see IAM section)
7. **Configuration** → **General**:
   - Timeout: `2 min 0 sec`
   - Memory: `1024 MB`
8. **Environment variables** - add the variables above
9. **Code** - upload zip via GitHub Actions (`.github/workflows/deploy-lambda.yml`) or manually to S3:
   - Bucket: `preread-deploy-artifacts-...` (artifacts)
   - Key: `lambda/process-document-{sha}.zip`
10. **Triggers** - add SQS (see Event Source Mapping section)

### Code structure

```
lambda/process-document/
├── index.js        # handler - loop over Records, batchItemFailures
├── processor.js    # S3 → Bedrock → Prisma
└── package.json
```

The handler returns `batchItemFailures` for partial retry:

```javascript
return { batchItemFailures: failures };
```

### Building the zip (what deploy does)

1. Copies `index.js`, `processor.js`, `package.json`
2. `npm install --omit=dev`
3. Adds Prisma schema with `binaryTargets: ["native", "rhel-openssl-3.0.x"]`
4. `npx prisma generate`
5. Removes CLI engines to reduce size
6. Compresses to zip and uploads to artifacts bucket

### VPC - when is it needed?

| Scenario                                                  | Lambda in VPC?                                |
| --------------------------------------------------------- | --------------------------------------------- |
| RDS **Publicly accessible** + security group allows broad IP | Not required (less recommended for production) |
| RDS **Private** inside VPC                                | **Yes** - Lambda needs subnets + security group |

> If RDS is private - add `VpcConfig` to Lambda (subnets + security group) in Console / CLI, and ensure NAT or VPC endpoints for Bedrock, S3, and Secrets Manager.

### Common pitfalls

| Issue                                 | Solution                                                    |
| ------------------------------------- | ----------------------------------------------------------- |
| `Task timed out after 120.00 seconds` | Large PDF / slow Bedrock - increase timeout or reduce PDF   |
| `Cannot find module '@prisma/client'` | Re-run deploy - prisma generate missing from zip            |
| `ENOENT` in handler                   | Ensure `Handler` is `index.handler` (file `index.mjs`)      |
| Code update not applied               | Re-run `Deploy Lambda` workflow (new S3 key per git SHA)    |

---

## 6. IAM Role and Policies

### Role in the project

`ProcessDocumentRole` - the Lambda execution role.

### Manual creation in AWS Console

1. **IAM** → **Roles** → **Create role**
2. **Trusted entity:** AWS service → **Lambda**
3. **Attach policies:**
   - `AWSLambdaBasicExecutionRole` (CloudWatch Logs)
4. **Create inline policy** `DocumentProcessorPolicy`:

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
      "Resource": "arn:aws:sqs:us-east-1:ACCOUNT:preread-docs-UploadQueue-*"
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

5. If Lambda is in VPC - add `AWSLambdaVPCAccessExecutionRole`

### CloudFormation equivalent

```yaml
ProcessDocumentRole:
  Type: AWS::IAM::Role
  Properties:
    AssumeRolePolicyDocument:
      Statement:
        - Effect: Allow
          Principal:
            Service: lambda.amazonaws.com
          Action: sts:AssumeRole
    ManagedPolicyArns:
      - arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole
    Policies:
      - PolicyName: DocumentProcessorPolicy
        # ...
```

> Deploy requires `CAPABILITY_NAMED_IAM` because resources are created with explicit names.

### Separate IAM - Express app (S3 uploads)

Not part of the stack. The Express app does not read access keys from `.env` - `S3Client` uses the AWS SDK [default credential chain](https://docs.aws.amazon.com/sdkref/latest/guide/standardized-credentials.html). Whoever provides credentials (local AWS CLI profile or EC2 instance role) needs at least:

```json
{
  "Effect": "Allow",
  "Action": ["s3:PutObject"],
  "Resource": "arn:aws:s3:::preread-uploads-*/*"
}
```

---

## 7. AWS Secrets Manager

### Role in the project

Stores `DATABASE_URL` - Lambda reads the secret at runtime (does not store password directly in env).

### Name and ARN

| Field       | Value                                                              |
| ----------- | ------------------------------------------------------------------ |
| Secret name | `preread/database-url`                                             |
| Content     | Full string: `postgresql://user:pass@host:5432/db?sslmode=require` |

### Manual creation in AWS Console

1. **Secrets Manager** → **Store a new secret**
2. **Secret type:** Other type of secret
3. **Key/value** or plain text - paste the full `DATABASE_URL`
4. **Secret name:** `preread/database-url`
5. **Automatic rotation:** off (for development)
6. Copy the **ARN** - pass to CFN as `DatabaseUrlSecretArn`

### Syncing from `.env` to Secrets Manager

Update the secret manually in Console, or with AWS CLI:

```bash
aws secretsmanager put-secret-value \
  --secret-id preread/database-url \
  --secret-string "$DATABASE_URL" \
  --region us-east-1
```

Ensure `DATABASE_URL` in the secret matches the DB Lambda should connect to.

### Code in Lambda

```javascript
const secret = await secrets.send(
  new GetSecretValueCommand({ SecretId: process.env.DATABASE_URL_SECRET_ARN }),
);
process.env.DATABASE_URL = secret.SecretString;
```

### Common pitfalls

| Issue                                     | Solution                                                     |
| ----------------------------------------- | ------------------------------------------------------------ |
| `AccessDeniedException` on GetSecretValue | Add `secretsmanager:GetSecretValue` to role with correct ARN |
| Lambda connects to wrong DB               | Update secret `preread/database-url` (or `DATABASE_URL` in Lambda env) |
| Secret in different region                | Secret and Lambda must be in the same region                 |

---

## 8. Amazon RDS (PostgreSQL)

### Role in the project

Central database - users, documents, words, flashcards (Prisma).

**Not created in CloudFormation** - managed separately.

### Manual creation in AWS Console

1. **RDS** → **Create database**
2. **Engine:** PostgreSQL (version 15+ recommended)
3. **Templates:** Free tier (development) / Production
4. **DB instance identifier:** e.g. `preread-db`
5. **Master username / password:** store securely
6. **Instance configuration:** `db.t3.micro` (development)
7. **Storage:** gp3, 20 GB
8. **Connectivity:**
   - **VPC:** default VPC or dedicated VPC
   - **Public access:**
     - `Yes` - simple for local development (less secure)
     - `No` - production; requires VPN / bastion / Lambda in VPC
9. **VPC security group:** create new or use existing
   - **Inbound:** TCP `5432` from your IP (development) or from Lambda SG (production)
10. **Database name:** `preread_dev` (development) or `postgres`
11. **Create database**

### Local connection

```env
DATABASE_URL=postgresql://USER:PASSWORD@preread-db.xxxx.us-east-1.rds.amazonaws.com:5432/preread_dev?sslmode=require
```

### DB setup for development

```bash
# Push schema to DB (fast development)
npm run db:push

# Or migrations with history
npm run db:migrate
```

Ensure `DATABASE_URL` in `.env` points to a development DB (e.g. `preread_dev`) and not prod.

### Migrations

```bash
npm run db:migrate      # development
npm run db:deploy       # production / CI
```

### Public vs Private

| Mode            | Local Express          | Lambda                          |
| --------------- | ---------------------- | ------------------------------- |
| **Public RDS**  | Connects directly (SG + IP) | Connects directly (no VPC)  |
| **Private RDS** | Requires VPN / SSH tunnel | **Must** have Lambda in VPC + SG rule |

### Common pitfalls

| Issue                            | Solution                                                                                  |
| -------------------------------- | ----------------------------------------------------------------------------------------- |
| `Connection timed out` from Lambda | Private RDS but Lambda not in VPC - add VPC or make public (temporary)                  |
| `password authentication failed` | Check secret / DATABASE_URL                                                               |
| `self signed certificate`        | Add `?sslmode=require` to `DATABASE_URL`                                                  |
| Prisma `Can't reach database`    | SG does not allow 5432 from the correct source                                            |

---

## 9. EC2 Security Groups (VPC)

### Role in the project

When RDS is in a private VPC, you need:

1. **Security Group for Lambda** (`preread-lambda-sg`) - outbound to all destinations (default)
2. **RDS Security Group** - inbound on port `5432` **from** `preread-lambda-sg`

### Manual creation

#### Lambda SG

1. **VPC** → **Security Groups** → **Create**
2. **Name:** `preread-lambda-sg`
3. **VPC:** same VPC as RDS
4. **Outbound:** All traffic (default)

#### RDS - adding ingress

1. Open RDS SG → **Edit inbound rules**
2. **Add rule:**
   - Type: PostgreSQL
   - Port: 5432
   - Source: `preread-lambda-sg` (security group ID)
   - Description: `Preread Lambda to RDS`

### Adding ingress from Lambda to RDS (manual)

In Console or with AWS CLI, add an inbound rule to the RDS SG:

- Type: PostgreSQL
- Port: 5432
- Source: Lambda security group (`preread-lambda-sg` or the function's SG)
- Description: `Preread Lambda to RDS`

Example with AWS CLI:

```bash
aws ec2 authorize-security-group-ingress \
  --group-id sg-RDS \
  --protocol tcp \
  --port 5432 \
  --source-group sg-LAMBDA
```

### Lambda VPC Config (if adding)

```yaml
VpcConfig:
  SecurityGroupIds:
    - sg-xxxxxxxx
  SubnetIds:
    - subnet-aaa
    - subnet-bbb
```

> Subnets should be **private** (with NAT) or **public** with NAT - Lambda needs access to Bedrock, S3, Secrets Manager (VPC endpoints or NAT).

### Common pitfalls

| Issue                    | Solution                                                       |
| ------------------------ | -------------------------------------------------------------- |
| Lambda timeout on everything | Missing NAT Gateway / VPC endpoints for S3, Secrets Manager, Bedrock |
| `ETIMEDOUT` to RDS only  | RDS SG does not allow from Lambda SG                           |
| Slow cold start          | VPC adds latency - normal                                      |

---

## 10. Amazon Bedrock

### Role in the project

Extracts academic vocabulary from PDFs using a foundation model.

### Models in the project

| Source                                 | Default Model ID                                 |
| -------------------------------------- | ------------------------------------------------ |
| `.env.example` / GitHub secret         | `global.anthropic.claude-sonnet-4-6`             |
| `lambda/process-document/processor.js` | `global.anthropic.claude-sonnet-4-6`             |

**Recommendation:** pick one model and set `BEDROCK_MODEL_ID` everywhere.

| Family               | Example Model ID                                 | PDF support         | API in code                                     |
| -------------------- | ------------------------------------------------ | ------------------- | ----------------------------------------------- |
| **Anthropic Claude** | `global.anthropic.claude-sonnet-4-20250514-v1:0` | Yes (document block)| `@anthropic-ai/bedrock-sdk` → `messages.create` |
| **Amazon Nova**      | `amazon.nova-pro-v1:0`                           | Via Converse API    | Requires code change (not current SDK)          |

### Enabling model access (required!)

1. **Bedrock** → **Model access** (or **Chat / Text playground**)
2. **Modify model access** / **Enable**
3. Approve:
   - **Anthropic Claude** (if using Claude)
   - **Amazon Nova** (if using Nova)
4. Wait a few minutes until **Access granted**

### IAM actions

```yaml
Action:
  - bedrock:InvokeModel
  - bedrock:CallWithBearerToken
Resource: '*'
```

Current code uses `@anthropic-ai/bedrock-sdk` which performs `InvokeModel` with Lambda role credentials.

### Bedrock variables in Lambda

| Variable                        | Description                  |
| ------------------------------- | ---------------------------- |
| `BEDROCK_MODEL_ID`              | Full model identifier        |
| `BEDROCK_TEMPERATURE`           | `0` = deterministic          |
| `BEDROCK_TOP_P`                 | Optional                     |
| `BEDROCK_TOKEN_EXPIRES_SECONDS` | For future bearer token use  |

### Common pitfalls

| Issue                                   | Solution                                                    |
| --------------------------------------- | ----------------------------------------------------------- |
| `AccessDeniedException`                 | Enable model access in Console                              |
| `Model not found`                       | Check region - not every model in every region              |
| `does not support PDF` / `document`     | Switch to Claude; Nova requires different Converse API      |
| `ValidationException` on document name  | In Converse API: document name - `[a-zA-Z0-9]` only, no spaces |
| Response not JSON                       | Model wrapped in markdown - code tries to extract JSON via regex |
| Model ID in CFN ≠ in code               | Set `BEDROCK_MODEL_ID` explicitly in deploy               |

---

## 11. Lambda Event Source Mapping

### Role in the project

Connects `UploadQueue` to `preread-process-document` - Lambda is invoked automatically when messages arrive.

### Parameters from the project

| Parameter                 | Value                     |
| ------------------------- | ------------------------- |
| **BatchSize**             | `10`                      |
| **FunctionResponseTypes** | `ReportBatchItemFailures` |
| **Event source**          | SQS ARN of `UploadQueue`  |

### Manual creation in AWS Console

1. **Lambda** → `preread-process-document` → **Configuration** → **Triggers**
2. **Add trigger**
3. **Source:** SQS
4. **SQS queue:** select `UploadQueue`
5. **Batch size:** `10`
6. **Report batch item failures:** Enabled
7. **Save**

### CloudFormation equivalent

```yaml
ProcessDocumentEventSource:
  Type: AWS::Lambda::EventSourceMapping
  Properties:
    BatchSize: 10
    EventSourceArn: !GetAtt UploadQueue.Arn
    FunctionName: !Ref ProcessDocumentFunction
    FunctionResponseTypes:
      - ReportBatchItemFailures
```

### How batchItemFailures works

```javascript
// index.mjs
failures.push({ itemIdentifier: record.messageId });
return { batchItemFailures: failures };
```

Only failed messages return to the queue after visibility timeout; the rest are deleted.

### Common pitfalls

| Issue                         | Solution                                                      |
| ----------------------------- | ------------------------------------------------------------- |
| Lambda not invoked            | Check trigger is in `Enabled` state                           |
| Same message keeps returning  | Unhandled error - check Logs; message retries until retention |
| Partial batch failure not working | Ensure `ReportBatchItemFailures` is enabled               |

---

## 12. AWS CloudFormation / Infrastructure

### Role in the project

Processing resources (S3 upload, SQS, Lambda, IAM, Event Source) are managed in AWS Console / CLI. **Code deployment** (Lambda zip + EC2 application) is done via **GitHub Actions**.

If you have an existing stack named `preread-docs` - you can continue managing it in Console. Creating new resources is documented in sections 3–11 (manual creation).

### Bootstrap for deploy artifacts (one-time)

Before CI/CD:

1. Run once (as admin with `iam:PutRolePolicy`):

```bash
./infra-setup/bootstrap/grant-deploy-bucket-permissions.sh \
  <github-deploy-role-name> <ec2-instance-role-name> [aws-region]
```

2. Add GitHub Variable / Secret `DEPLOY_ARTIFACTS_BUCKET` with the created bucket name.
3. Run workflow **Bootstrap Deploy Bucket** (`workflow_dispatch`) from Actions.

### Infrastructure diagnostics

There is no `diagnose.mjs` script in the repo. Check manually:

```bash
# Stack (if exists)
aws cloudformation describe-stacks --stack-name preread-docs --region us-east-1

# Lambda
aws lambda get-function --function-name preread-process-document --region us-east-1

# SQS depth
aws sqs get-queue-attributes \
  --queue-url "$QUEUE_URL" \
  --attribute-names ApproximateNumberOfMessages ApproximateNumberOfMessagesNotVisible

# CloudWatch logs
aws logs tail /aws/lambda/preread-process-document --follow --region us-east-1
```

---

## 13. Environment Variables

### Full mapping table

| `.env` variable               | Service        | Usage                                                             |
| ----------------------------- | -------------- | ----------------------------------------------------------------- |
| `DATABASE_URL`                | RDS            | Express + Prisma; in production also in GitHub secrets / Lambda env |
| `AWS_REGION`                  | All AWS SDK    | `us-east-1`                                                       |
| `S3_UPLOAD_BUCKET`            | S3             | Upload bucket name - **required in production**                    |
| `BEDROCK_MODEL_ID`            | Bedrock        | **Lambda only** - set in GitHub secret / Lambda env               |
| `PORT`                        | Express        | `3000`                                                            |
| `BETTER_AUTH_SECRET`          | Application    | Authentication                                                    |
| `CSRF_SECRET`                 | Application    | CSRF                                                              |
| `BETTER_AUTH_URL`             | Application    | Base URL                                                          |
| `GOOGLE_CLIENT_ID` / `SECRET` | OAuth          | Google sign-in                                                    |
| `RESEND_API_KEY`              | Email          | Sending emails                                                    |

### AWS credentials (not in `.env`)

The Express app initializes `S3Client` with only `region` (see `src/services/s3Service.js`). Credentials are resolved automatically:

| Environment | How credentials are provided |
| ----------- | ---------------------------- |
| Local dev   | AWS CLI profile (`aws configure`) or env vars set outside `.env` |
| EC2         | Instance IAM role (instance profile) |

Do not add `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` to `.env` - they are not read by the application.

### Lambda-only variables (not in Express `.env`)

| Variable                  | Source                                      |
| ------------------------- | ------------------------------------------- |
| `BEDROCK_MODEL_ID`        | GitHub secret / Lambda environment          |
| `DATABASE_URL`            | GitHub secret (workflow updates Lambda env) |
| `DATABASE_URL_SECRET_ARN` | Optional - Secrets Manager instead of direct URL |

---

## 14. Deploy Process (GitHub Actions)

### First time - checklist

- [ ] Create RDS PostgreSQL + `npm run db:push` or `db:migrate`
- [ ] Fill local `.env` (DATABASE_URL, AWS_REGION, S3_UPLOAD_BUCKET) and configure a local AWS CLI profile for S3 uploads
- [ ] Enable model access in Bedrock Console
- [ ] Create S3/SQS/Lambda resources (Console / CLI - sections 3–11)
- [ ] Bootstrap: `grant-deploy-bucket-permissions.sh` + Bootstrap Deploy Bucket workflow
- [ ] Configure GitHub secrets (see table below)
- [ ] Copy `S3_UPLOAD_BUCKET` to `.env` and EC2 deploy secrets
- [ ] `npm run dev` - test PDF upload
- [ ] Diagnose with AWS CLI / Console (section 12)

### Required GitHub Secrets

| Secret | Usage |
|--------|--------|
| `AWS_ROLE_ARN` | OIDC role for GitHub Actions |
| `AWS_REGION` | e.g. `us-east-1` |
| `DEPLOY_ARTIFACTS_BUCKET` | Artifacts bucket (from bootstrap) |
| `DATABASE_URL` | Lambda + EC2 |
| `BEDROCK_MODEL_ID` | Lambda env |
| `PORT`, `BETTER_AUTH_URL`, `BETTER_AUTH_SECRET`, `CSRF_SECRET` | EC2 `.env` |
| `S3_UPLOAD_BUCKET` | EC2 |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | EC2 (optional) |
| `RESEND_API_KEY` | EC2 (optional) |

### Updating Lambda code

Workflow: **Deploy Lambda** (`.github/workflows/deploy-lambda.yml`)

- Runs automatically on push to `main` when changing `lambda/**`
- Or manually via `workflow_dispatch`
- Builds zip (including Prisma generate), uploads to S3, `UpdateFunctionCode` + updates env (`BEDROCK_MODEL_ID`, `DATABASE_URL`)

### Updating DB password

1. Update `DATABASE_URL` in GitHub secrets (and Secrets Manager if using ARN)
2. Re-run **Deploy Lambda** (and/or update secret manually)
3. Also update EC2 deploy secret if the app uses the same URL

### Workflows in repo

| Workflow | File | Purpose |
|----------|------|---------|
| Bootstrap Deploy Bucket | `.github/workflows/bootstrap-deploy-bucket.yml` | Create artifacts bucket (one-time) |
| Deploy Lambda | `.github/workflows/deploy-lambda.yml` | Build + deploy Lambda code |
| Deploy EC2 | `.github/workflows/deploy-ec2.yml` | Bundle + SSM deploy for application |

---

## 15. Application Deployment to EC2

The application (Express + EJS) runs on **EC2**. PDF processing stays in Lambda. **Provisioning** of the instance (SG, IAM, nginx, PM2) is one-time; **code updates** run via GitHub Actions.

### Architecture

```mermaid
flowchart LR
  Browser["Browser http://EC2_IP"] --> Nginx["nginx :80"]
  Nginx --> Express["Express + PM2 :3000"]
  Express --> RDS[(RDS)]
  Express -->|PutObject| S3[(S3 Upload)]
  S3 --> SQS --> Lambda --> Bedrock
  Lambda --> RDS
```

### Prerequisites

- Processing resources (S3 + SQS + Lambda) already exist
- RDS PostgreSQL in the same VPC
- EC2 instance exists with tag `Name=preread-app`, SSM Agent, PM2 process named `preread`, and app at `/opt/preread/app`
- GitHub secrets configured (section 14)
- Instance role with permission to read from `s3://DEPLOY_ARTIFACTS_BUCKET/ec2/*`

### Commands / CI

```text
# Automatic: push to main changing src/, public/, prisma/, package.json
# Or manual: Actions → Deploy EC2 → Run workflow
```

Workflow: **Deploy EC2** (`.github/workflows/deploy-ec2.yml`)

1. Bundles `src/`, `public/`, `prisma/schema.prisma`, `package.json`, `package-lock.json`
2. Uploads to S3 artifacts (`ec2/app-{sha}.tar.gz`)
3. Runs deploy via **SSM Run Command** on instances with tag `Name=preread-app`
4. On server: extracts, `npm ci`, writes `.env` from `APP_ENV`, `pm2 restart preread`

> The workflow **does not** create a new instance - only updates an existing deployment.

### What must exist in AWS (one-time provisioning)

| Resource | Name / description |
|----------|-------------------|
| EC2 | Tag `Name=preread-app`, Instance Profile (e.g. `preread-ec2-app`) |
| Security Group | inbound 80 (and 443 if TLS), 22 as needed |
| RDS ingress | port 5432 from application SG |
| IAM | `s3:PutObject` on upload bucket, `s3:GetObject` on `ec2/*` in artifacts, `AmazonSSMManagedInstanceCore` |
| On server | Node 22, nginx (80→3000), PM2, app at `/opt/preread/app` |

### Environment variables on EC2

The workflow writes `/opt/preread/app/.env` from secrets:

| Variable | Value |
|----------|-------|
| `NODE_ENV` | `production` |
| `PORT` | from `PORT` secret |
| `BETTER_AUTH_URL` | from secret |
| `TRUST_PROXY` | `true` |
| `DATABASE_URL`, `S3_UPLOAD_BUCKET`, … | from secrets |

**Important - HTTP vs HTTPS:**

- When `BETTER_AUTH_URL` starts with `http://` (public IP without domain): Helmet **disables** HSTS, COOP, and `upgrade-insecure-requests`. Cookies without `Secure`.
- When `BETTER_AUTH_URL` starts with `https://` (domain + TLS): HSTS, COOP, and Secure cookies are enabled.

If the browser previously received HSTS for this IP, clear the cache:

- Chrome/Edge: `chrome://net-internals/#hsts` → Delete domain security policies → enter the IP
- Or browse in a private window

### Updating code after changes

Push to `main` (or manually run Deploy EC2). No need to re-provision unless you deleted the instance.

### Elastic IP (recommended)

EC2 public IP changes after stop/start. To fix:

1. EC2 Console → Elastic IPs → Allocate
2. Associate to `preread-app` instance
3. Update `BETTER_AUTH_URL` in GitHub secrets and re-run Deploy EC2

### HTTPS in the future (domain)

1. Attach Elastic IP + register A record for domain
2. On EC2: Certbot + nginx listen 443
3. Update secrets: `BETTER_AUTH_URL=https://your.domain` (`TRUST_PROXY=true` already in workflow)
4. Open port 443 on application SG
5. Run Deploy EC2 or `pm2 restart preread`

### Verification

1. `http://<PUBLIC_IP>` - home page loads with CSS
2. Sign up / sign in
3. Upload PDF - object in S3 + Lambda processing

---

## 16. Diagnostics and Troubleshooting

### Primary diagnostic tools

Use AWS Console / CLI (see section 12) and Lambda CloudWatch Logs.

### Common issues table

| Symptom                                                           | Likely cause                                             | Solution                                                                                               |
| ----------------------------------------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `Bedrock invoke failed (403)`                                     | Model access not enabled                                 | Bedrock Console → Enable model                                                                         |
| `AccessDeniedException` + `CallWithBearerToken`                 | Missing permission on IAM role                           | Add `bedrock:CallWithBearerToken` to Lambda role                                                       |
| `on-demand throughput isn't supported`                            | Using direct foundation model ID instead of inference profile | Set `BEDROCK_MODEL_ID=global.anthropic.claude-sonnet-4-6` (or `us.` / `eu.` per region)           |
| `does not support document / PDF`                                 | Nova model with Claude code                              | Set `BEDROCK_MODEL_ID` to Claude inference profile                                                     |
| `The document file name can only contain alphanumeric characters` | Invalid document name in Converse API                    | Use a name like `document` only                                                                        |
| Lambda `Task timed out`                                           | Slow RDS connection / VPC without NAT                    | Add VPC endpoints or increase timeout                                                                  |
| `Can't reach database server`                                     | Private RDS, Lambda not in VPC                           | Add `VpcConfig` to Lambda + SG rules                                                                   |
| `No matching processing document for s3 object`                   | DB record not created before S3 event                    | Ensure app created `Document` with matching `s3Key`                                                    |
| Document stuck in `processing`                                    | Server crashed mid-process                               | `failStuckProcessingDocuments()` on restart; or manual update                                        |
| SQS messages growing, Lambda not running                          | Trigger disconnected / permission error                  | Check Event Source Mapping in Console                                                                  |
| `S3_UPLOAD_BUCKET is not configured`                              | Missing in `.env` / secrets                              | Add after creating bucket                                                                              |
| CloudFormation `ROLLBACK_COMPLETE`                                | Creation order / bucket name taken                       | Delete stack in Console and retry                                                                      |
| Upload works, no words                                            | Hebrew PDF / no English                                  | Expected behavior - returns `words: []`                                                                |
| Filename with special characters                                  | Normalized in s3Key                                      | Only `a-zA-Z0-9-_` - other chars become `_`                                                            |
| CSS/JS load over `https://` and fail (`ERR_CONNECTION_TIMED_OUT`) | HSTS / upgrade-insecure-requests on HTTP IP              | Ensure `BETTER_AUTH_URL=http://...`; clear HSTS; re-run Deploy EC2                                     |
| `Cross-Origin-Opener-Policy` ignored                            | COOP requires HTTPS                                      | Automatically disabled when URL is HTTP                                                                |
| 502 Bad Gateway from nginx                                        | PM2 / Express not running                                | `pm2 logs preread` via SSM; check `BETTER_AUTH_SECRET`                                                |

### CloudWatch Logs

```
Log group: /aws/lambda/preread-process-document
```

**Console:** CloudWatch → Log groups → search for `preread-process-document`

### Manual end-to-end flow test

1. Upload PDF via UI
2. Check object in S3 upload bucket
3. Check `ApproximateNumberOfMessages` in SQS (should drop to 0)
4. Check Lambda Logs
5. Check DB: `processing_status` → `ready`

### Prisma errors in Lambda

| Error                                             | Solution                                          |
| ------------------------------------------------- | ------------------------------------------------- |
| `Prisma Client could not locate the Query Engine` | Run Deploy Lambda - missing `rhel-openssl-3.0.x` binary |
| `Invalid prisma.document.findFirst()`             | schema does not match DB in `DATABASE_URL`        |

---

## 17. Cost and Security

### Cost estimate (development, us-east-1)

| Service              | Estimated cost                         |
| -------------------- | -------------------------------------- |
| RDS `db.t3.micro`    | ~$15/month (Free tier first year)      |
| EC2 `t3.small`       | ~$15/month                             |
| Lambda               | Free up to 1M requests / 400K GB-s     |
| S3                   | Cents per PDF size                     |
| SQS                  | Nearly free at low volume              |
| Bedrock              | Per tokens + model - main usage cost   |
| Secrets Manager      | ~$0.40/secret/month                    |
| NAT Gateway (if VPC) | ~$32+/month - avoid in development     |

### Security - best practices

| Topic             | Recommendation                                            |
| ----------------- | --------------------------------------------------------- |
| **Passwords**     | Never in git; use Secrets Manager for Lambda              |
| **S3**            | Block Public Access; access only via IAM                  |
| **RDS**           | Private subnet in production; restrictive SG              |
| **IAM**           | Local dev: AWS CLI profile; EC2: instance IAM role - never access keys in `.env` |
| **Bedrock**       | Restrict `Resource` in IAM to specific model when possible |
| **TLS**           | `sslmode=require` in DATABASE_URL; HTTPS for domain in production |
| **HTTP on IP**    | Do not enable HSTS - app disables automatically per `BETTER_AUTH_URL` |
| **Rate limiting** | Configured in app (`RATE_LIMIT_UPLOAD_MAX=5`)             |
| **CSRF**          | Enabled in Express (`__preread_csrf`)                     |

### Resource cleanup

```bash
# Delete stack (if exists; keeps RDS and Secret!)
aws cloudformation delete-stack --stack-name preread-docs --region us-east-1

# Delete artifacts bucket (empty first)
aws s3 rm s3://preread-deploy-artifacts-ACCOUNT-us-east-1 --recursive
aws s3 rb s3://preread-deploy-artifacts-ACCOUNT-us-east-1
```

---

## Appendix - Quick Commands

```bash
# Deploy Lambda (CI) - push to main on lambda/** or Actions → Deploy Lambda
# Deploy EC2 (CI) - push to main on src/** / public/** or Actions → Deploy EC2

# Bootstrap artifacts bucket (one-time, admin)
./infra-setup/bootstrap/grant-deploy-bucket-permissions.sh \
  <github-deploy-role> <ec2-instance-role> us-east-1

# Sync secret to DB
aws secretsmanager put-secret-value \
  --secret-id preread/database-url \
  --secret-string "$DATABASE_URL"

# DB
npm run db:push          # fast development
npm run db:migrate       # migrations

# Run local server
npm run dev
```

---

## Appendix - Relevant Project Files

| File | Description |
|------|-------------|
| `.github/workflows/deploy-lambda.yml` | Build + deploy Lambda code |
| `.github/workflows/deploy-ec2.yml` | Bundle + SSM deploy to EC2 |
| `.github/workflows/bootstrap-deploy-bucket.yml` | Create artifacts bucket |
| `infra-setup/bootstrap/grant-deploy-bucket-permissions.sh` | Bootstrap IAM for artifacts bucket |
| `lambda/process-document/` | Lambda code |
| `src/services/s3Service.js` | S3 upload from application |
| `prisma/schema.prisma` | DB schema |
| `.env.example` | Environment variables template |

---

_This document was created for the Preread project. Values such as Account ID, ARNs, and passwords - replace with your own. Never commit real secrets to git._
