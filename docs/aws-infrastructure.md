# מדריך תשתית AWS — פרויקט Preread

מסמך טכני מקיף (עברית + אנגלית) לבניית ותחזוקת כל שירותי AWS שבהם משתמשת אפליקציית **Preread** — העלאת PDF, עיבוד אסינכרוני, חילוץ אוצר מילים דרך **Amazon Bedrock**, ושמירה ב-**RDS PostgreSQL**.

---

## תוכן עניינים

1. [סקירה כללית](#1-סקירה-כללית)
2. [דרישות מוקדמות](#2-דרישות-מוקדמות)
3. [Amazon S3](#3-amazon-s3)
4. [Amazon SQS](#4-amazon-sqs)
5. [AWS Lambda](#5-aws-lambda)
6. [IAM Role ומדיניות](#6-iam-role-ומדיניות)
7. [AWS Secrets Manager](#7-aws-secrets-manager)
8. [Amazon RDS (PostgreSQL)](#8-amazon-rds-postgresql)
9. [EC2 Security Groups (VPC)](#9-ec2-security-groups-vpc)
10. [Amazon Bedrock](#10-amazon-bedrock)
11. [Lambda Event Source Mapping](#11-lambda-event-source-mapping)
12. [AWS CloudFormation](#12-aws-cloudformation)
13. [משתני סביבה](#13-משתני-סביבה)
14. [תהליך Deploy](#14-תהליך-deploy)
15. [פריסת האפליקציה ל-EC2](#15-פריסת-האפליקציה-ל-ec2)
16. [אבחון ופתרון תקלות](#16-אבחון-ופתרון-תקלות)
17. [עלות ואבטחה](#17-עלות-ואבטחה)

---

## 1. סקירה כללית

### מה האפליקציה עושה?

**Preread** היא אפליקציית Express שמאפשרת למשתמשים להעלות קובצי PDF. לאחר העלאה:

1. השרת שומר רשומת `Document` ב-DB עם `processingStatus: processing`
2. השרת מעלה את ה-PDF ל-**S3** (`PutObject`)
3. **S3 Event Notification** שולח הודעה ל-**SQS**
4. **Lambda** (`preread-process-document`) נקראת מהתור
5. ה-Lambda קוראת את ה-PDF מ-S3, שולחת ל-**Bedrock** לחילוץ מילים, ושומרת ב-**RDS** דרך Prisma
6. הסטטוס מתעדכן ל-`ready` או `failed`

### דיאגרמת ארכיטקטורה

```mermaid
flowchart LR
  subgraph Client["דפדפן / משתמש"]
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

### משאבים ב-CloudFormation (`infra/template.yaml`)

| Logical ID                   | סוג AWS                           | שם פיזי / ברירת מחדל                     |
| ---------------------------- | --------------------------------- | ---------------------------------------- |
| `UploadQueue`                | `AWS::SQS::Queue`                 | `preread-docs-UploadQueue-XXXXX`         |
| `UploadQueuePolicy`          | `AWS::SQS::QueuePolicy`           | —                                        |
| `UploadBucket`               | `AWS::S3::Bucket`                 | `preread-uploads-{AccountId}-{region}`   |
| `ProcessDocumentRole`        | `AWS::IAM::Role`                  | `preread-docs-ProcessDocumentRole-XXXXX` |
| `ProcessDocumentFunction`    | `AWS::Lambda::Function`           | `preread-process-document`               |
| `ProcessDocumentEventSource` | `AWS::Lambda::EventSourceMapping` | UUID אוטומטי                             |

> **חשוב:** **RDS** אינו חלק מה-stack — יוצרים אותו בנפרד. ה-deploy script מסנכרן את `DATABASE_URL` ל-Secrets Manager.

### Stack name

```
preread-docs
```

---

## 2. דרישות מוקדמות

### חשבון AWS

| דרישה                  | פירוט                                                          |
| ---------------------- | -------------------------------------------------------------- |
| חשבון AWS פעיל         | עם הרשאות ליצור S3, SQS, Lambda, IAM, Secrets Manager, Bedrock |
| Region                 | **`us-east-1`** (ברירת מחדל בפרויקט)                           |
| IAM User / Role לפיתוח | עם `AWS_ACCESS_KEY_ID` + `AWS_SECRET_ACCESS_KEY` ב-`.env`      |

### כלים מקומיים

| כלי                     | שימוש                             |
| ----------------------- | --------------------------------- |
| **Node.js** 22+         | הרצת האפליקציה וסקריפטי deploy    |
| **npm**                 | `npm install` בשורש וב-`infra/`   |
| **AWS CLI** (אופציונלי) | אבחון ידני, בדיקות                |
| **Prisma CLI**          | מיגרציות DB: `npm run db:migrate` |

### התקנת תלויות infra

```bash
cd infra
npm install
cd ..
```

### הרשאות IAM מומלצות למפתח (מינימום ל-deploy)

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

> בפרודקשן — צמצמו הרשאות לפי עקרון least privilege.

### קובץ `.env`

העתיקו מ-`.env.example` ומלאו לפחות:

```env
DATABASE_URL=postgresql://USER:PASSWORD@your-instance.region.rds.amazonaws.com:5432/preread_dev?sslmode=require
AWS_REGION=us-east-1
S3_UPLOAD_BUCKET=   # ימולא אחרי deploy ראשון
```

---

## 3. Amazon S3

### תפקיד בפרויקט

שני buckets:

| Bucket               | שם (ברירת מחדל)                           | מטרה                                                         |
| -------------------- | ----------------------------------------- | ------------------------------------------------------------ |
| **Upload Bucket**    | `preread-uploads-{AccountId}-us-east-1`   | אחסון PDF שהמשתמשים מעלים                                    |
| **Artifacts Bucket** | `preread-artifacts-{AccountId}-us-east-1` | zip של קוד Lambda (לא ב-CFN template — נוצר ב-deploy script) |

### זרימת העלאה

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

פורמט מפתח: `{userId}-{timestamp}-{normalized-filename}.pdf`

### יצירה ידנית ב-AWS Console

#### Upload Bucket

1. **S3** → **Create bucket**
2. **Bucket name:** `preread-uploads-123456789012-us-east-1` (ייחודי גלובלית)
3. **Region:** `us-east-1`
4. **Block Public Access:** השאירו **מופעל** (הגישה רק דרך IAM)
5. **Create bucket**
6. אחרי יצירת SQS + Queue Policy — **Properties** → **Event notifications** → **Create event notification**:
   - **Event types:** `All object create events` או ספציפית `PUT`
   - **Destination:** SQS queue → בחרו את `UploadQueue`
7. **Permissions** — ה-Queue Policy (סעיף SQS) מאפשר ל-S3 לשלוח הודעות

#### Artifacts Bucket

1. **Create bucket** בשם `preread-artifacts-{AccountId}-us-east-1`
2. אין צורך ב-event notifications
3. משמש רק ל-`UpdateFunctionCode` של Lambda

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

### IAM — מי צריך גישה?

| שירות / אפליקציה             | פעולות                                             | Resource                           |
| ---------------------------- | -------------------------------------------------- | ---------------------------------- |
| Express App (משתמש IAM)      | `s3:PutObject`                                     | `arn:aws:s3:::preread-uploads-*/*` |
| Lambda `ProcessDocumentRole` | `s3:GetObject`                                     | `arn:aws:s3:::preread-uploads-*/*` |
| Deploy script                | `s3:CreateBucket`, `s3:PutObject`, `s3:HeadBucket` | artifacts bucket                   |

### ערכי תצורה חשובים

| פרמטר                       | ערך                                                                           |
| --------------------------- | ----------------------------------------------------------------------------- |
| Event                       | `s3:ObjectCreated:Put` בלבד (לא multipart complete בנפרד — `PutObject` מספיק) |
| Content-Type בהעלאה         | `application/pdf`                                                             |
| `S3_UPLOAD_BUCKET` ב-`.env` | חייב להתאים לשם ה-bucket בפועל                                                |

### מלכודות נפוצות

| בעיה                              | סיבה                                              | פתרון                                                                  |
| --------------------------------- | ------------------------------------------------- | ---------------------------------------------------------------------- |
| העלאה עובדת אבל Lambda לא רצה     | אין event notification או Queue Policy חסר        | ודאו `DependsOn: UploadQueuePolicy` לפני ה-bucket ב-CFN                |
| `Access Denied` בהעלאה מהאפליקציה | ל-IAM user חסר `s3:PutObject`                     | הוסיפו policy ל-user                                                   |
| שם bucket תפוס                    | שמות S3 גלובליים                                  | שנו את `UploadBucketName` / `S3_UPLOAD_BUCKET`                         |
| Circular dependency ב-CFN         | שימוש ב-`!GetAtt UploadBucket.Arn` ב-Queue Policy | הפרויקט משתמש ב-`!Sub 'arn:aws:s3:::${UploadBucketName}'` — שמרו על כך |

---

## 4. Amazon SQS

### תפקיד בפרויקט

תור ביניים בין S3 ל-Lambda. כל `PutObject` ל-upload bucket יוצר הודעה עם מטא-דאטה של אובייקט S3 (פורמט S3 Event Notification).

### יצירה ידנית ב-AWS Console

1. **SQS** → **Create queue**
2. **Type:** Standard
3. **Name:** לדוגמה `preread-upload-queue`
4. **Visibility timeout:** **`120` שניות** (חייב להיות ≥ timeout של Lambda)
5. **Create queue**
6. **Access policy** → הוסיפו policy שמאפשר ל-S3 לשלוח:

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

7. **חובה:** צרו את ה-Queue Policy **לפני** הגדרת ה-S3 notification

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

### IAM — Lambda role

```yaml
Action:
  - sqs:ReceiveMessage
  - sqs:DeleteMessage
  - sqs:GetQueueAttributes
Resource: !GetAtt UploadQueue.Arn
```

### מבנה הודעה (מה ה-Lambda מצפה)

```javascript
// processor.mjs — parseS3FromRecord
const body = JSON.parse(record.body);
const s3Record = body.Records[0];
// s3Record.s3.bucket.name, s3Record.s3.object.key
```

### מלכודות נפוצות

| בעיה                              | פתרון                                                       |
| --------------------------------- | ----------------------------------------------------------- |
| הודעות נתקעות ב-In Flight         | הגדילו `VisibilityTimeout` או קצרו עיבוד Lambda             |
| הודעות ב-DLQ (אם הוגדר)           | בדקו CloudWatch Logs של Lambda                              |
| S3 notification נכשל ב-validation | Queue Policy חייב להיות קיים **לפני** ה-bucket notification |

---

## 5. AWS Lambda

### תפקיד בפרויקט

פונקציה `preread-process-document` — מעבדת PDF אחד (או batch של עד 10) מכל invocation.

### פרמטרים מהפרויקט

| פרמטר            | ערך                                             |
| ---------------- | ----------------------------------------------- |
| **FunctionName** | `preread-process-document`                      |
| **Runtime**      | `nodejs22.x`                                    |
| **Handler**      | `index.handler`                                 |
| **Timeout**      | `120` שניות                                     |
| **Memory**       | `1024` MB                                       |
| **VPC**          | **אין** (ב-template הנוכחי — Lambda מחוץ ל-VPC) |

### משתני סביבה (ב-Lambda)

| משתנה                           | מקור          | ערך ברירת מחדל                                   |
| ------------------------------- | ------------- | ------------------------------------------------ |
| `BEDROCK_MODEL_ID`              | CFN Parameter | `global.anthropic.claude-sonnet-4-20250514-v1:0` |
| `BEDROCK_TEMPERATURE`           | CFN           | `0`                                              |
| `DATABASE_URL_SECRET_ARN`       | CFN Parameter | ARN של `preread/database-url`                    |

> בקוד (`processor.js`) ברירת המחדל למודל היא `global.anthropic.claude-sonnet-4-20250514-v1:0` — ודאו שה-`BEDROCK_MODEL_ID` ב-Lambda תואם למודל שביקשתם ב-Bedrock Console (inference profile, לא foundation model ID ישיר).

### יצירה ידנית ב-AWS Console

1. **Lambda** → **Create function**
2. **Author from scratch**
3. **Function name:** `preread-process-document`
4. **Runtime:** Node.js 22.x
5. **Architecture:** x86_64
6. **Execution role:** בחרו / צרו role עם הרשאות (ראו סעיף IAM)
7. **Configuration** → **General**:
   - Timeout: `2 min 0 sec`
   - Memory: `1024 MB`
8. **Environment variables** — הוסיפו את המשתנים למעלה
9. **Code** — העלו zip (ראו `infra/push-lambda.mjs`) או S3:
   - Bucket: `preread-artifacts-...`
   - Key: `process-document-{timestamp}.zip`
10. **Triggers** — הוסיפו SQS (ראו סעיף Event Source Mapping)

### מבנה הקוד

```
lambda/process-document/
├── index.js        # handler — לולאה על Records, batchItemFailures
├── processor.js    # S3 → Bedrock → Prisma
└── package.json
```

ה-handler מחזיר `batchItemFailures` ל-retry חלקי:

```javascript
return { batchItemFailures: failures };
```

### בניית zip (מה ה-deploy עושה)

1. מעתיק `index.js`, `processor.js`, `package.json`
2. `npm install --omit=dev`
3. מוסיף Prisma schema עם `binaryTargets: ["native", "rhel-openssl-3.0.x"]`
4. `npx prisma generate`
5. מוחק CLI engines כדי לצמצם גודל
6. דוחס ל-zip ומעלה ל-artifacts bucket

### VPC — מתי צריך?

| תרחיש                                                     | VPC ב-Lambda?                                 |
| --------------------------------------------------------- | --------------------------------------------- |
| RDS **Publicly accessible** + security group מאפשר IP רחב | לא חובה (פחות מומלץ לפרודקשן)                 |
| RDS **Private** בתוך VPC                                  | **כן** — Lambda חייב subnets + security group |

> `infra/deploy.mjs` מכיל פונקציה `discoverNetwork()` לגילוי VPC של RDS ויצירת `preread-lambda-sg`, אך **template.yaml הנוכחי לא מגדיר VPC** ל-Lambda. אם RDS פרטי — תצטרכו להוסיף `VpcConfig` ל-template או לעדכן ידנית.

### מלכודות נפוצות

| בעיה                                  | פתרון                                                       |
| ------------------------------------- | ----------------------------------------------------------- |
| `Task timed out after 120.00 seconds` | PDF גדול / Bedrock איטי — הגדילו timeout או הקטינו PDF      |
| `Cannot find module '@prisma/client'` | הריצו deploy מחדש — prisma generate חסר ב-zip               |
| `ENOENT` ב-handler                    | ודאו ש-`Handler` הוא `index.handler` (קובץ `index.mjs`)     |
| עדכון קוד לא נכנס                     | השתמשו ב-`node infra/push-lambda.mjs` (מפתח S3 חדש בכל פעם) |

---

## 6. IAM Role ומדיניות

### תפקיד בפרויקט

`ProcessDocumentRole` — ה-execution role של Lambda.

### יצירה ידנית ב-AWS Console

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

5. אם Lambda ב-VPC — הוסיפו `AWSLambdaVPCAccessExecutionRole`

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

> Deploy דורש `CAPABILITY_NAMED_IAM` כי נוצרים resources עם שמות מפורשים.

### IAM נפרד — משתמש האפליקציה (Express)

לא חלק מה-stack. ל-IAM user ב-`.env` צריך לפחות:

```json
{
  "Effect": "Allow",
  "Action": ["s3:PutObject"],
  "Resource": "arn:aws:s3:::preread-uploads-*/*"
}
```

---

## 7. AWS Secrets Manager

### תפקיד בפרויקט

שמירת `DATABASE_URL` — Lambda קוראת את ה-secret ב-runtime (לא שומרת סיסמה ב-env ישירות).

### שם ו-ARN

| שדה         | ערך                                                                |
| ----------- | ------------------------------------------------------------------ |
| Secret name | `preread/database-url`                                             |
| תוכן        | מחרוזת מלאה: `postgresql://user:pass@host:5432/db?sslmode=require` |

### יצירה ידנית ב-AWS Console

1. **Secrets Manager** → **Store a new secret**
2. **Secret type:** Other type of secret
3. **Key/value** או plain text — הדביקו את `DATABASE_URL` המלא
4. **Secret name:** `preread/database-url`
5. **Automatic rotation:** כבוי (לפיתוח)
6. העתיקו את ה-**ARN** — מעבירים ל-CFN כ-`DatabaseUrlSecretArn`

### סנכרון מ-`.env`

```bash
node infra/sync-db-secret.mjs
```

משווה את ה-DB name ב-secret מול `DATABASE_URL` ב-`.env` ומעדכן אם שונה.

### קוד ב-Lambda

```javascript
const secret = await secrets.send(
  new GetSecretValueCommand({ SecretId: process.env.DATABASE_URL_SECRET_ARN }),
);
process.env.DATABASE_URL = secret.SecretString;
```

### מלכודות נפוצות

| בעיה                                      | פתרון                                                     |
| ----------------------------------------- | --------------------------------------------------------- |
| `AccessDeniedException` על GetSecretValue | הוסיפו `secretsmanager:GetSecretValue` ל-role עם ARN נכון |
| Lambda מתחבר ל-DB הלא נכון                | הריצו `sync-db-secret.mjs` אחרי שינוי `DATABASE_URL`      |
| Secret ב-region שונה                      | Secret ו-Lambda חייבים להיות באותו region                 |

---

## 8. Amazon RDS (PostgreSQL)

### תפקיד בפרויקט

מסד נתונים מרכזי — משתמשים, מסמכים, מילים, flashcards (Prisma).

**לא נוצר ב-CloudFormation** — מנוהל בנפרד.

### יצירה ידנית ב-AWS Console

1. **RDS** → **Create database**
2. **Engine:** PostgreSQL (גרסה 15+ מומלצת)
3. **Templates:** Free tier (פיתוח) / Production
4. **DB instance identifier:** לדוגמה `preread-db`
5. **Master username / password:** שמרו בצורה מאובטחת
6. **Instance configuration:** `db.t3.micro` (פיתוח)
7. **Storage:** gp3, 20 GB
8. **Connectivity:**
   - **VPC:** default VPC או VPC ייעודי
   - **Public access:**
     - `Yes` — פשוט לפיתוח מקומי (פחות מאובטח)
     - `No` — פרודקשן; דורש VPN / bastion / Lambda ב-VPC
9. **VPC security group:** צרו חדש או קיימים
   - **Inbound:** TCP `5432` מ-IP שלכם (פיתוח) או מ-Lambda SG (פרודקשן)
10. **Database name:** `preread_dev` (פיתוח) או `postgres`
11. **Create database**

### חיבור מקומי

```env
DATABASE_URL=postgresql://USER:PASSWORD@preread-db.xxxx.us-east-1.rds.amazonaws.com:5432/preread_dev?sslmode=require
```

### הגדרת DB לפיתוח (בידוד מ-prod)

```bash
npm run db:setup-dev
# או: node prisma/setup-dev-db.mjs
```

יוצר DB `preread_dev`, מריץ migrations, ומעדכן `.env`.

### מיגרציות

```bash
npm run db:migrate      # פיתוח
npm run db:deploy       # פרודקשן / CI
```

### Public vs Private

| מצב             | Express מקומי          | Lambda                          |
| --------------- | ---------------------- | ------------------------------- |
| **Public RDS**  | מתחבר ישירות (SG + IP) | מתחבר ישירות (ללא VPC)          |
| **Private RDS** | דורש VPN / SSH tunnel  | **חייב** Lambda ב-VPC + SG rule |

### מלכודות נפוצות

| בעיה                             | פתרון                                                                                     |
| -------------------------------- | ----------------------------------------------------------------------------------------- |
| `Connection timed out` מ-Lambda  | RDS פרטי אבל Lambda לא ב-VPC — הוסיפו VPC או הפכו ל-public (זמני)                         |
| `password authentication failed` | בדקו secret / DATABASE_URL                                                                |
| `self signed certificate`        | הוסיפו `?sslmode=require` ; בפיתוח `setup-dev-db.mjs` משתמש ב-`rejectUnauthorized: false` |
| Prisma `Can't reach database`    | SG לא מאפשר 5432 מהמקור הנכון                                                             |

---

## 9. EC2 Security Groups (VPC)

### תפקיד בפרויקט

כש-RDS בתוך VPC פרטי, צריך:

1. **Security Group ל-Lambda** (`preread-lambda-sg`) — יציאה לכל היעדים (ברירת מחדל)
2. **Security Group של RDS** — כניסה על פורט `5432` **מ**-`preread-lambda-sg`

### יצירה ידנית

#### Lambda SG

1. **VPC** → **Security Groups** → **Create**
2. **Name:** `preread-lambda-sg`
3. **VPC:** אותו VPC כמו RDS
4. **Outbound:** All traffic (ברירת מחדל)

#### RDS — הוספת ingress

1. פתחו את SG של RDS → **Edit inbound rules**
2. **Add rule:**
   - Type: PostgreSQL
   - Port: 5432
   - Source: `preread-lambda-sg` (security group ID)
   - Description: `Preread Lambda to RDS`

### מה deploy.mjs עושה (אוטומציה)

```javascript
// allowRdsFromLambda — מוסיף ingress מ-lambdaSgId ל-rdsSgIds
await ec2.send(
  new AuthorizeSecurityGroupIngressCommand({
    GroupId: rdsSgId,
    IpPermissions: [
      {
        IpProtocol: 'tcp',
        FromPort: 5432,
        ToPort: 5432,
        UserIdGroupPairs: [{ GroupId: lambdaSgId }],
      },
    ],
  }),
);
```

### Lambda VPC Config (אם מוסיפים ל-template)

```yaml
VpcConfig:
  SecurityGroupIds:
    - sg-xxxxxxxx
  SubnetIds:
    - subnet-aaa
    - subnet-bbb
```

> Subnets צריכים להיות **private** (עם NAT) או **public** עם NAT — Lambda צריכה גישה ל-Bedrock, S3, Secrets Manager (VPC endpoints או NAT).

### מלכודות נפוצות

| בעיה                     | פתרון                                                          |
| ------------------------ | -------------------------------------------------------------- |
| Lambda timeout על כל דבר | חסר NAT Gateway / VPC endpoints ל-S3, Secrets Manager, Bedrock |
| `ETIMEDOUT` ל-RDS בלבד   | SG של RDS לא מאפשר מ-Lambda SG                                 |
| Cold start איטי          | VPC מוסיף latency — נורמלי                                     |

---

## 10. Amazon Bedrock

### תפקיד בפרויקט

חילוץ אוצר מילים אקדמי מ-PDF באמצעות מודל foundation.

### מודלים בפרויקט

| מקור                                   | Model ID ברירת מחדל                              |
| -------------------------------------- | ------------------------------------------------ |
| `infra/template.yaml`                  | `global.anthropic.claude-sonnet-4-20250514-v1:0` |
| `lambda/process-document/processor.js` | `global.anthropic.claude-sonnet-4-20250514-v1:0` |

**המלצה:** בחרו מודל אחד והגדירו `BEDROCK_MODEL_ID` בכל מקום.

| משפחה                | Model ID לדוגמה                                  | PDF support         | API בקוד                                        |
| -------------------- | ------------------------------------------------ | ------------------- | ----------------------------------------------- |
| **Anthropic Claude** | `global.anthropic.claude-sonnet-4-20250514-v1:0` | כן (document block) | `@anthropic-ai/bedrock-sdk` → `messages.create` |
| **Amazon Nova**      | `amazon.nova-pro-v1:0`                           | דרך Converse API    | דורש שינוי קוד (לא SDK הנוכחי)                  |

### הפעלת גישה למודל (חובה!)

1. **Bedrock** → **Model access** (או **Chat / Text playground**)
2. **Modify model access** / **Enable**
3. אשרו:
   - **Anthropic Claude** (אם משתמשים ב-Claude)
   - **Amazon Nova** (אם משתמשים ב-Nova)
4. המתינו כמה דקות עד **Access granted**

### IAM actions

```yaml
Action:
  - bedrock:InvokeModel
  - bedrock:CallWithBearerToken
Resource: '*'
```

הקוד הנוכחי משתמש ב-`@anthropic-ai/bedrock-sdk` שמבצע `InvokeModel` עם credentials של ה-Lambda role.

### משתני Bedrock ב-Lambda

| משתנה                           | תיאור                        |
| ------------------------------- | ---------------------------- |
| `BEDROCK_MODEL_ID`              | מזהה מודל מלא                |
| `BEDROCK_TEMPERATURE`           | `0` = דטרמיניסטי             |
| `BEDROCK_TOP_P`                 | אופציונלי                    |
| `BEDROCK_TOKEN_EXPIRES_SECONDS` | לשימוש עתידי עם bearer token |

### מלכודות נפוצות

| בעיה                                   | פתרון                                                    |
| -------------------------------------- | -------------------------------------------------------- |
| `AccessDeniedException`                | הפעילו model access ב-Console                            |
| `Model not found`                      | בדקו region — לא כל מודל בכל region                      |
| `does not support PDF` / `document`    | עברו ל-Claude; Nova דורש Converse API שונה               |
| `ValidationException` על document name | ב-Converse API: שם מסמך — `[a-zA-Z0-9]` בלבד, ללא רווחים |
| תשובה לא JSON                          | המודל עטף ב-markdown — הקוד מנסה לחלץ JSON ב-regex       |
| Model ID ב-CFN ≠ בקוד                  | הגדירו `BEDROCK_MODEL_ID` מפורש ב-deploy                 |

---

## 11. Lambda Event Source Mapping

### תפקיד בפרויקט

מחבר את `UploadQueue` ל-`preread-process-document` — Lambda נקראת אוטומטית כשמגיעות הודעות.

### פרמטרים מהפרויקט

| פרמטר                     | ערך                       |
| ------------------------- | ------------------------- |
| **BatchSize**             | `10`                      |
| **FunctionResponseTypes** | `ReportBatchItemFailures` |
| **Event source**          | SQS ARN של `UploadQueue`  |

### יצירה ידנית ב-AWS Console

1. **Lambda** → `preread-process-document` → **Configuration** → **Triggers**
2. **Add trigger**
3. **Source:** SQS
4. **SQS queue:** בחרו את `UploadQueue`
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

### איך batchItemFailures עובד

```javascript
// index.mjs
failures.push({ itemIdentifier: record.messageId });
return { batchItemFailures: failures };
```

רק הודעות שנכשלו יחזרו לתור אחרי visibility timeout; השאר נמחקות.

### מלכודות נפוצות

| בעיה                          | פתרון                                                      |
| ----------------------------- | ---------------------------------------------------------- |
| Lambda לא מופעלת              | בדקו ש-trigger ב-state `Enabled`                           |
| אותה הודעה חוזרת              | שגיאה בלתי מטופלת — בדקו Logs; הודעה תנסה שוב עד retention |
| Partial batch failure לא עובד | ודאו `ReportBatchItemFailures` מופעל                       |

---

## 12. AWS CloudFormation

### תפקיד בפרויקט

`infra/template.yaml` מגדיר את כל משאבי העיבוד (S3, SQS, Lambda, IAM, Event Source) כ-stack אחד.

### Parameters

| Parameter              | מקור ב-deploy                                              | דוגמה                                            |
| ---------------------- | ---------------------------------------------------------- | ------------------------------------------------ |
| `UploadBucketName`     | `S3_UPLOAD_BUCKET` או `preread-uploads-{Account}-{region}` | `preread-uploads-123456789012-us-east-1`         |
| `DatabaseUrlSecretArn` | נוצר ע"י `ensureSecret()`                                  | `arn:aws:secretsmanager:...`                     |
| `BedrockModelId`       | `BEDROCK_MODEL_ID` env                                     | `global.anthropic.claude-sonnet-4-20250514-v1:0` |

### Outputs

| Output                   | שימוש              |
| ------------------------ | ------------------ |
| `UploadQueueArn`         | אבחון / אינטגרציות |
| `UploadBucketNameOutput` | וידוא שם bucket    |

### Deploy אוטומטי

```bash
npm run infra:deploy
# שקול ל:
node infra/deploy.mjs
```

#### מה הסקריפט עושה (בסדר)

1. טוען `.env`
2. מאמת `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `DATABASE_URL`
3. `STS GetCallerIdentity` — מזהה Account ID
4. יוצר/מעדכן secret `preread/database-url`
5. בונה zip של Lambda (Prisma generate כלול)
6. מעלה ל-`preread-artifacts-{Account}-{region}`
7. מחליף placeholders ב-template (`S3Bucket`, `S3Key`)
8. יוצר/מעדכן change set ל-stack `preread-docs`
9. מבצע `UpdateFunctionCode` ישירות (עוקף CFN no-op)

### Deploy ידני עם AWS CLI

```bash
aws cloudformation deploy \
  --template-file infra/template.yaml \
  --stack-name preread-docs \
  --capabilities CAPABILITY_NAMED_IAM \
  --parameter-overrides \
    UploadBucketName=preread-uploads-123456789012-us-east-1 \
    DatabaseUrlSecretArn=arn:aws:secretsmanager:us-east-1:123456789012:secret:preread/database-url-AbCdEf \
    BedrockModelId=global.anthropic.claude-sonnet-4-20250514-v1:0 \
  --region us-east-1
```

### מצבי Stack

| Status                     | משמעות                                   |
| -------------------------- | ---------------------------------------- |
| `CREATE_COMPLETE`          | הצלחה                                    |
| `UPDATE_COMPLETE`          | עדכון הצליח                              |
| `ROLLBACK_COMPLETE`        | יצירה נכשלה — deploy.mjs מוחק ויוצר מחדש |
| `UPDATE_ROLLBACK_COMPLETE` | עדכון נכשל — בדקו Events                 |

### אבחון stack

```bash
node infra/diagnose.mjs
```

מציג: stack status, resources, Lambda state, VPC, SQS depth, CloudWatch logs אחרונים.

---

## 13. משתני סביבה

### טבלת מיפוי מלאה

| משתנה `.env`                  | שירות          | שימוש                                                             |
| ----------------------------- | -------------- | ----------------------------------------------------------------- |
| `DATABASE_URL`                | RDS            | Express + Prisma; מסונכרן ל-Secrets Manager ב-deploy              |
| `AWS_REGION`                  | כל AWS SDK     | `us-east-1`                                                       |
| `AWS_ACCESS_KEY_ID`           | IAM User       | העלאות S3 מהאפליקציה + deploy                                     |
| `AWS_SECRET_ACCESS_KEY`       | IAM User       | כנ״ל                                                              |
| `S3_UPLOAD_BUCKET`            | S3             | שם upload bucket — **חובה בפרודקשן**                              |
| `BEDROCK_MODEL_ID`            | Bedrock / CFN  | מועבר כ-parameter ב-deploy (לא ב-`.env.example` — הוסיפו אם צריך) |
| `STACK_NAME`                  | CloudFormation | ברירת מחדל `preread-docs` (רק ב-deploy)                           |
| `PORT`                        | Express        | `3000`                                                            |
| `BETTER_AUTH_SECRET`          | אפליקציה       | אימות                                                             |
| `CSRF_SECRET`                 | אפליקציה       | CSRF                                                              |
| `BETTER_AUTH_URL`             | אפליקציה       | URL בסיס                                                          |
| `GOOGLE_CLIENT_ID` / `SECRET` | OAuth          | התחברות Google                                                    |
| `RESEND_API_KEY`              | Email          | שליחת מיילים                                                      |

### משתנים ב-Lambda בלבד (לא ב-`.env` של Express)

| משתנה                           | מקור           |
| ------------------------------- | -------------- |
| `DATABASE_URL_SECRET_ARN`       | CloudFormation |
| `BEDROCK_TEMPERATURE`           | CloudFormation |
| `BEDROCK_TOKEN_EXPIRES_SECONDS` | CloudFormation |

---

## 14. תהליך Deploy

### פעם ראשונה — צ'קליסט

- [ ] יצירת RDS PostgreSQL + הרצת `npm run db:setup-dev` / migrations
- [ ] מילוי `.env` (DATABASE_URL, AWS credentials)
- [ ] הפעלת model access ב-Bedrock Console
- [ ] `cd infra && npm install`
- [ ] `npm run infra:deploy`
- [ ] העתקת `S3_UPLOAD_BUCKET` מהפלט ל-`.env`
- [ ] `node infra/sync-db-secret.mjs` (אם שיניתם DB אחרי deploy)
- [ ] `npm run dev` — בדיקת העלאת PDF
- [ ] `node infra/diagnose.mjs` — וידוא שהכל ירוק

### עדכון תשתית (SQS, IAM, env vars ב-Lambda)

```bash
npm run infra:deploy
```

מעדכן CloudFormation + secret + Lambda code.

### עדכון קוד Lambda בלבד (מהיר)

```bash
node infra/push-lambda.mjs
```

1. בונה zip חדש
2. מעלה ל-artifacts bucket עם key ייחודי (`process-document-{timestamp}.zip`)
3. `UpdateFunctionCode` + ממתין ל-`LastUpdateStatus: Successful`

> השתמשו בזה אחרי שינוי ב-`lambda/process-document/` בלי לגעת ב-template.

### עדכון סיסמת DB

1. עדכנו `DATABASE_URL` ב-`.env`
2. `node infra/sync-db-secret.mjs`
3. (אופציונלי) `npm run infra:deploy` — מוודא שה-ARN עדיין נכון

### סקריפטים נוספים

| סקריפט                         | מטרה                                  |
| ------------------------------ | ------------------------------------- |
| `infra/deploy.ps1`             | גרסת PowerShell ל-deploy (Windows)    |
| `infra/diagnose.mjs`           | אבחון מצב stack / Lambda / SQS / logs |
| `infra/sync-db-secret.mjs`     | סנכרון DATABASE_URL ל-Secrets Manager |
| `infra/update-lambda-code.mjs` | עדכון קוד (אם קיים)                   |

---

## 15. פריסת האפליקציה ל-EC2

האפליקציה (Express + EJS) רצה על **EC2**. עיבוד PDF נשאר ב-Lambda. הסקריפטים ב-`infra/` מקימים את השרת ומעלים קוד.

### ארכיטקטורה

```mermaid
flowchart LR
  Browser["Browser http://EC2_IP"] --> Nginx["nginx :80"]
  Nginx --> Express["Express + PM2 :3000"]
  Express --> RDS[(RDS)]
  Express -->|PutObject| S3[(S3 Upload)]
  S3 --> SQS --> Lambda --> Bedrock
  Lambda --> RDS
```

### דרישות מוקדמות

- Stack `preread-docs` כבר deployed (S3 + SQS + Lambda)
- RDS PostgreSQL באותו VPC
- `.env` מקומי עם: `DATABASE_URL`, `S3_UPLOAD_BUCKET`, `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`
- `BETTER_AUTH_SECRET` — ערך ייחודי (לא ערך ה-dev). אם חסר, `ec2:push` מייצר אחד אוטומטית

### פקודות

```bash
# פעם ראשונה — יצירת EC2, Security Group, IAM Role, חיבור ל-RDS
npm run ec2:deploy

# העלאת קוד + .env + prisma migrate + PM2
npm run ec2:push
```

| סקריפט | קובץ | מה עושה |
|--------|------|---------|
| `ec2:deploy` | `infra/deploy-ec2.mjs` | מאתר RDS/VPC, יוצר `preread-app-sg`, IAM role `preread-ec2-app`, משיק `t3.small` (Amazon Linux 2023), ממתין ל-SSM |
| `ec2:push` | `infra/push-app.mjs` | אורז את הקוד, מעלה ל-S3 artifacts, מריץ deploy דרך SSM |

מצב ה-instance נשמר ב-`infra/.build/ec2-state.json` (לא ב-git).

### מה נוצר ב-AWS

| משאב | שם / תיאור |
|------|------------|
| EC2 | Tag `Name=preread-app`, Instance Profile `preread-ec2-app` |
| Security Group | `preread-app-sg` — inbound 80 מכל מקום, 22 מה-IP שלך |
| RDS ingress | פורט 5432 מ-`preread-app-sg` |
| IAM | `s3:PutObject` על upload bucket, `s3:GetObject` על artifacts, `AmazonSSMManagedInstanceCore` |
| על השרת | Node 22, nginx (80→3000), PM2, אפליקציה ב-`/opt/preread/app` |

### משתני סביבה על EC2

`ec2:push` כותב `/opt/preread/app/.env`:

| משתנה | ערך |
|--------|-----|
| `NODE_ENV` | `production` |
| `PORT` | `3000` |
| `BETTER_AUTH_URL` | `http://<PUBLIC_IP>` |
| `TRUST_PROXY` | `false` |
| `DATABASE_URL`, `S3_UPLOAD_BUCKET`, … | מועתקים מה-`.env` המקומי |

**חשוב — HTTP מול HTTPS:**

- כש-`BETTER_AUTH_URL` מתחיל ב-`http://` (IP ציבורי בלי דומיין): Helmet **מכבה** HSTS, COOP ו-`upgrade-insecure-requests`. Cookies בלי `Secure`.
- כש-`BETTER_AUTH_URL` מתחיל ב-`https://` (דומיין + TLS): מופעלים HSTS, COOP, ו-Secure cookies.

אם הדפדפן כבר קיבל HSTS בעבר ל-IP הזה, נקו את ה-cache:

- Chrome/Edge: `chrome://net-internals/#hsts` → Delete domain security policies → הזינו את ה-IP
- או גלישה בחלון פרטי

### עדכון קוד אחרי שינויים

```bash
npm run ec2:push
```

אין צורך ב-`ec2:deploy` מחדש אלא אם מחקתם את ה-instance.

### Elastic IP (מומלץ)

IP ציבורי של EC2 משתנה אחרי stop/start. כדי לקבע:

1. EC2 Console → Elastic IPs → Allocate
2. Associate ל-instance `preread-app`
3. עדכנו `BETTER_AUTH_URL=http://NEW_IP` והריצו `npm run ec2:push`

### HTTPS בעתיד (דומיין)

1. הצמידו Elastic IP + רשמו A record לדומיין
2. על EC2: Certbot + nginx listen 443
3. עדכנו `.env` על השרת: `BETTER_AUTH_URL=https://your.domain`, `TRUST_PROXY=true`
4. פתחו פורט 443 ב-`preread-app-sg`
5. `pm2 restart preread`

### אימות

1. `http://<PUBLIC_IP>` — דף הבית נטען עם CSS
2. הרשמה / התחברות
3. העלאת PDF — אובייקט ב-S3 + עיבוד Lambda

---

## 16. אבחון ופתרון תקלות

### כלי אבחון ראשוני

```bash
node infra/diagnose.mjs
```

### טבלת תקלות נפוצות

| תסמין                                                             | סיבה סבירה                                               | פתרון                                                                                                  |
| ----------------------------------------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `Bedrock invoke failed (403)`                                     | Model access לא הופעל                                    | Bedrock Console → Enable model                                                                         |
| `AccessDeniedException` + `CallWithBearerToken`                   | חסרה הרשאה ב-IAM role                                    | הוסיפו `bedrock:CallWithBearerToken` (כבר ב-template)                                                  |
| `on-demand throughput isn't supported`                            | שימוש ב-foundation model ID ישיר במקום inference profile | הגדירו `BEDROCK_MODEL_ID=global.anthropic.claude-sonnet-4-20250514-v1:0` (או `us.` / `eu.` לפי region) |
| `does not support document / PDF`                                 | מודל Nova עם קוד Claude                                  | הגדירו `BEDROCK_MODEL_ID=global.anthropic.claude-sonnet-4-...`                                         |
| `The document file name can only contain alphanumeric characters` | שם מסמך לא תקין ב-Converse API                           | השתמשו בשם כמו `document` בלבד                                                                         |
| Lambda `Task timed out`                                           | חיבור RDS איטי / VPC בלי NAT                             | הוסיפו VPC endpoints או הגדילו timeout                                                                 |
| `Can't reach database server`                                     | RDS private, Lambda לא ב-VPC                             | הוסיפו `VpcConfig` ל-Lambda + SG rules                                                                 |
| `No matching processing document for s3 object`                   | רשומת DB לא נוצרה לפני S3 event                          | ודאו שהאפליקציה יצרה `Document` עם `s3Key` תואם                                                        |
| מסמך תקוע ב-`processing`                                          | שרת נפל באמצע                                            | `failStuckProcessingDocuments()` בריסטארט; או עדכון ידני                                               |
| SQS messages גדלות, Lambda לא רצה                                 | Trigger מנותק / שגיאת הרשאות                             | בדקו Event Source Mapping ב-Console                                                                    |
| `S3_UPLOAD_BUCKET is not configured`                              | חסר ב-`.env`                                             | הוסיפו אחרי deploy ראשון                                                                               |
| CloudFormation `ROLLBACK_COMPLETE`                                | סדר יצירה / שם bucket תפוס                               | מחקו stack (`deploy.mjs` עושה זאת אוטומטית) ונסו שוב                                                   |
| העלאה עובדת, אין מילים                                            | PDF בעברית / אין אנגלית                                  | התנהגות תקינה — מחזיר `words: []`                                                                      |
| שם קובץ עם תווים מיוחדים                                          | מנורמל ב-s3Key                                           | רק `a-zA-Z0-9-_` — תווים אחרים הופכים ל-`_`                                                            |
| CSS/JS נטענים ב-`https://` ונופלים (`ERR_CONNECTION_TIMED_OUT`) | HSTS / upgrade-insecure-requests על HTTP IP              | ודאו `BETTER_AUTH_URL=http://...`; נקו HSTS ב-`chrome://net-internals/#hsts`; הריצו `npm run ec2:push` |
| `Cross-Origin-Opener-Policy` ignored                              | COOP דורש HTTPS                                          | מושבת אוטומטית כש-URL הוא HTTP                                                                         |
| 502 Bad Gateway מ-nginx                                           | PM2 / Express לא רץ                                      | `pm2 logs preread` דרך SSM; בדקו `BETTER_AUTH_SECRET`                                                  |

### CloudWatch Logs

```
Log group: /aws/lambda/preread-process-document
```

**Console:** CloudWatch → Log groups → חפשו `preread-process-document`

### בדיקת זרימה מלאה ידנית

1. העלו PDF דרך UI
2. בדקו אובייקט ב-S3 upload bucket
3. בדקו `ApproximateNumberOfMessages` ב-SQS (צריך לרדת ל-0)
4. בדקו Logs של Lambda
5. בדקו ב-DB: `processing_status` → `ready`

### שגיאות Prisma ב-Lambda

| שגיאה                                             | פתרון                                          |
| ------------------------------------------------- | ---------------------------------------------- |
| `Prisma Client could not locate the Query Engine` | הריצו deploy — חסר `rhel-openssl-3.0.x` binary |
| `Invalid prisma.document.findFirst()`             | migrations לא רצו על ה-DB שב-secret            |

---

## 17. עלות ואבטחה

### הערכת עלות (פיתוח, us-east-1)

| שירות                | עלות משוערת                            |
| -------------------- | -------------------------------------- |
| RDS `db.t3.micro`    | ~$15/חודש (Free tier שנה ראשונה)       |
| EC2 `t3.small`       | ~$15/חודש                              |
| Lambda               | חינם עד 1M requests / 400K GB-s        |
| S3                   | סנטים לפי גודל PDF                     |
| SQS                  | כמעט חינם בנפח נמוך                    |
| Bedrock              | לפי tokens + מודל — העיקרי בעלות שימוש |
| Secrets Manager      | ~$0.40/secret/חודש                     |
| NAT Gateway (אם VPC) | ~$32+/חודש — הימנעו בפיתוח             |

### אבטחה — best practices

| נושא              | המלצה                                             |
| ----------------- | ------------------------------------------------- |
| **סיסמאות**       | לעולם לא ב-git; השתמשו ב-Secrets Manager ל-Lambda |
| **S3**            | Block Public Access; גישה רק דרך IAM              |
| **RDS**           | Private subnet בפרודקשן; SG מצמצם                 |
| **IAM**           | משתמש נפרד לפיתוח; בפרודקשן EC2 Instance Role     |
| **Bedrock**       | הגבילו `Resource` ב-IAM למודל ספציפי כשאפשר       |
| **TLS**           | `sslmode=require` ב-DATABASE_URL; HTTPS לדומיין בפרודקשן |
| **HTTP על IP**    | אל תפעילו HSTS — האפליקציה מכבה אוטומטית לפי `BETTER_AUTH_URL` |
| **Rate limiting** | מוגדר באפליקציה (`RATE_LIMIT_UPLOAD_MAX=5`)       |
| **CSRF**          | מופעל ב-Express (`__preread_csrf`)                |

### ניקוי משאבים

```bash
# מחיקת stack (שומר RDS ו-Secret!)
aws cloudformation delete-stack --stack-name preread-docs --region us-east-1

# מחיקת artifacts bucket (ריקנו קודם)
aws s3 rm s3://preread-artifacts-ACCOUNT-us-east-1 --recursive
aws s3 rb s3://preread-artifacts-ACCOUNT-us-east-1
```

---

## נספח — פקודות מהירות

```bash
# Deploy מלא (S3/SQS/Lambda)
npm run infra:deploy

# עדכון Lambda בלבד
node infra/push-lambda.mjs

# EC2 — יצירה ראשונה
npm run ec2:deploy

# EC2 — העלאת קוד
npm run ec2:push

# אבחון
node infra/diagnose.mjs

# סנכרון secret
node infra/sync-db-secret.mjs

# DB פיתוח
npm run db:setup-dev

# הרצת שרת
npm run dev
```

---

## נספח — קבצים רלוונטיים בפרויקט

| קובץ                        | תיאור                 |
| --------------------------- | --------------------- |
| `infra/template.yaml`       | CloudFormation stack  |
| `infra/deploy.mjs`          | Deploy אוטומטי (Node) |
| `infra/deploy-ec2.mjs`      | יצירת EC2 + SG + IAM  |
| `infra/push-app.mjs`        | העלאת אפליקציה ל-EC2  |
| `infra/ec2/`                | user-data, nginx, IAM |
| `infra/push-lambda.mjs`     | עדכון קוד Lambda מהיר |
| `infra/diagnose.mjs`        | אבחון תשתית           |
| `infra/sync-db-secret.mjs`  | סנכרון DATABASE_URL   |
| `lambda/process-document/`  | קוד Lambda            |
| `src/services/s3Service.js` | העלאה ל-S3 מהאפליקציה |
| `prisma/setup-dev-db.mjs`   | הקמת DB פיתוח         |
| `.env.example`              | תבנית משתני סביבה     |

---

_מסמך זה נוצר עבור פרויקט Preread. ערכים כמו Account ID, ARNs וסיסמאות — החליפו בערכים שלכם. לעולם אל תכניסו secrets אמיתיים ל-git._
