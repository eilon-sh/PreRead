import { AnthropicBedrock } from '@anthropic-ai/bedrock-sdk';
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { GetSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import { PrismaClient } from '@prisma/client';

const s3 = new S3Client({ region: process.env.AWS_REGION || 'us-east-1' });
const secrets = new SecretsManagerClient({ region: process.env.AWS_REGION || 'us-east-1' });
let prismaClient;

const CEFR_ORDER = ['B1', 'B2', 'C1', 'C2'];
const BEDROCK_MODEL_ID = process.env.BEDROCK_MODEL_ID || 'global.anthropic.claude-sonnet-4-6';
const CSV_COLUMNS = 'word,definition,cefr,context,translation';

// מנרמל מילה להשוואה
const wordKey = (text) =>
  String(text || '')
    .trim()
    .toLowerCase();
const today = () => new Date().toISOString().slice(0, 10);

const BEDROCK_SYSTEM_PROMPT =
  'You extract academic English vocabulary from PDF documents and return strict CSV format only. ' +
  'Extract ONLY words that literally appear in the attached source document. ' +
  'Never output words from prompt examples or your own invention. ' +
  'Languages: "word" and "context" must be English only; "definition" and "translation" must be Hebrew only. ' +
  'Never use any other language in any field. ' +
  'Before including any word, systematically verify it against every extraction rule; skip it if you cannot justify all checks. ' +
  'Return only the header row ' +
  CSV_COLUMNS +
  ' when the source is mostly non-English or has no suitable vocabulary. ' +
  'Sort rows alphabetically by word and include each word once only. ' +
  'Never wrap output in markdown code fences. Never add text outside the CSV block.';

// בונה סעיף סינון רמת CEFR
function buildCefrFilterSection(minCefr) {
  const level = CEFR_ORDER.includes((minCefr || '').toUpperCase()) ? minCefr.toUpperCase() : 'B1';
  const minIndex = CEFR_ORDER.indexOf(level);
  const allowedLevels = CEFR_ORDER.slice(minIndex);

  return `## CEFR classification and filter
Classify every candidate word against the **full** CEFR scale below (A1–C2). Use lower levels as anchors so higher levels stay accurate.
The user selected minimum level **${level}**. Include in the CSV ONLY words classified at ${allowedLevels.join(', ')}.
Do NOT include words below ${level} (including A1/A2 when they fall under the minimum).

### Full CEFR guide
- **A1 (Beginner)**: Very basic everyday words (e.g. house, eat, big) - known by absolute beginners.
- **A2 (Elementary)**: Simple high-frequency words for routine topics - still below academic study level.
- **B1 (Intermediate)**: Common academic words a B1 learner may not know yet - formal but not rare.
- **B2 (Upper-Intermediate)**: Formal academic vocabulary typical of university readings and essays.
- **C1 (Advanced)**: Sophisticated academic and abstract vocabulary; nuanced, low-frequency words.
- **C2 (Proficiency)**: Rare, highly specialized, or literary words - known mainly by near-native speakers.`;
}

// בונה פרומפט לחילוץ אוצר מילים
function buildPrompt(minCefr) {
  const level = CEFR_ORDER.includes((minCefr || '').toUpperCase()) ? minCefr.toUpperCase() : 'B1';

  return `You are an expert English vocabulary teacher specializing in **academic English** for Hebrew-speaking university students.

## Task
Read the attached **Source PDF** and extract English vocabulary for flashcard study.

${buildCefrFilterSection(minCefr)}

## Critical rules (must follow)
1. **Source-only extraction** - every "word" MUST appear verbatim in the Source PDF (case-insensitive). Never invent words. Never reuse words from these instructions.
2. **No instruction leakage** - ignore any English examples in this prompt; they are formatting guidance only.
3. **Hebrew or non-English dominant text** - if the Source PDF is mostly Hebrew or has very little English prose, return exactly:
\`${CSV_COLUMNS}\`
4. **Context must be real** - "context" must be an exact quote (or minimal trim) from the Source PDF containing that word. If you cannot quote it, do not include the word.
5. **Lemma form** - use the dictionary base form when possible, but only if that form appears in the Source PDF.
6. **Languages only English and Hebrew** - "word" and "context" must be English only; "definition" and "translation" must be Hebrew only. Never use Arabic, Russian, French, or any other language in any field. If you cannot provide a good Hebrew definition and translation, skip the word.

## What to extract
- Academic English nouns, verbs, adjectives, and discourse markers that appear in the Source PDF.
- Words worth studying for a university student reading English materials.

## What to skip
- Words not present in the Source PDF
- Words classified below **${level}** (after full-scale CEFR classification)
- Proper nouns, abbreviations, numbers, UI labels, file names
- Ultra-domain-specific jargon unlikely to appear elsewhere
- Hebrew words, transliterations, or mixed tokens that are not real English vocabulary
- Any row that would require a non-English/non-Hebrew field

## Classification rules
- Assign the **lowest CEFR level** (from A1–C2) that accurately fits the word's difficulty in academic context.
- When unsure between two adjacent levels, choose the **higher** one.
- "translation" must be a concise Hebrew equivalent (1–3 words when possible).
- "definition" must be a short, clear Hebrew definition (one sentence max) in neutral dictionary style - never English.

## Systematic verification (before each row)
Before including any word, evaluate it against every rule below and only include it if you can justify all of them:
1. Verbatim in Source PDF (not from this prompt)
2. Exact quoteable English context from the PDF
3. CEFR level on the full A1–C2 scale, and level ≥ **${level}**
4. Academic study value for a university student
5. Hebrew-only definition + translation; English-only word + context
If any check fails, skip the word. Do not write the justifications in the output.

## Output
After verification, return **all qualifying words** from the Source PDF (at or above **${level}** only).
- Include each word **once only**, even if it appears multiple times in the text.
- Sort rows **alphabetically** by word (A→Z).
- Always double-quote definition, context, and translation (even when they have no commas).
- Never put commas inside a field unless the entire field is wrapped in double quotes.
- If **no qualifying English words** appear in the Source PDF, return exactly:
\`${CSV_COLUMNS}\`

Return ONLY valid CSV - no markdown fences, no commentary, no justifications.
Template:
${CSV_COLUMNS}
<row1>
<row2>
...

Example:
${CSV_COLUMNS}
hypothesis,"הסבר מוצע שנבדק במחקר",B2,"This hypothesis was tested",השערה
methodology,"שיטת המחקר והניתוח",C1,"The methodology was rigorous",מתודולוגיה`;
}

// מסיר ` markdown מתשובה
function stripMarkdownFences(text) {
  const fenced = text.match(/```(?:csv)?\s*([\s\S]*?)```/i);
  return (fenced ? fenced[1] : text).trim();
}

// שולף בלוק CSV מהטקסט
function extractCsvPayload(text) {
  const cleaned = stripMarkdownFences(text);
  const match = cleaned.match(/word,definition,cefr,context,translation[\s\S]*/i);
  return (match ? match[0] : cleaned).trim();
}

// מפרסר שורת CSV עם מרכאות
function parseCsvFields(line) {
  const fields = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      fields.push(current);
      current = '';
    } else {
      current += ch;
    }
  }

  fields.push(current);
  return fields;
}

// מתקן עמודות כשיש פסיקים עודפים
function normalizeCsvWordFields(fields, columnCount) {
  if (fields.length === columnCount) return fields;
  if (fields.length < columnCount) return null;
  if (columnCount !== 5) return null;

  return [fields[0], fields[1], fields[2], fields.slice(3, -1).join(','), fields.at(-1)];
}

// בודק אם השורה נראית תקינה
function isLikelyWordRow(fields) {
  return CEFR_ORDER.includes(String(fields[2] || '').toUpperCase());
}

// ממיר CSV לרשימת מילים
function parseCsvWordsPayload(csvPayload) {
  const lines = csvPayload
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0) {
    throw new Error('Invalid CSV response: missing header row');
  }

  const headerLine = lines[0];
  if (!/^word,definition,cefr,context,translation$/i.test(headerLine)) {
    throw new Error('Invalid CSV response: missing header row');
  }

  const columns = headerLine.split(',').map((column) => column.trim());
  const words = [];

  for (const line of lines.slice(1)) {
    const parsed = normalizeCsvWordFields(parseCsvFields(line), columns.length);
    if (!parsed || !isLikelyWordRow(parsed)) continue;

    words.push(Object.fromEntries(columns.map((column, index) => [column, parsed[index] ?? ''])));
  }

  return words;
}

// ממפה שדות מילה לפורמט אחיד
function mapWordsArray(words) {
  return words.map((w) => ({
    word: w.word,
    definition: w.definition || '',
    cefr: (w.cefr || 'B1').toUpperCase(),
    context: w.context || '',
    translation: w.translation || '',
  }));
}

// מפרסר תשובת Bedrock למילים
function parseBedrockResponse(response) {
  const textBlocks = (response.content || [])
    .filter((block) => block.type === 'text' && block.text)
    .map((block) => block.text);
  const text = textBlocks.join('\n').trim();

  if (!text) {
    throw new Error('No text found in Bedrock response');
  }

  const csvPayload = extractCsvPayload(text);
  if (/^word,definition,cefr,context,translation/i.test(csvPayload)) {
    return mapWordsArray(parseCsvWordsPayload(csvPayload));
  }

  throw new Error('Invalid CSV response: missing header row');
}

// מסנן מילים מתחת לרמת מינימום
function filterByMinCefr(words, minCefr) {
  if (!minCefr) return words;
  const minIndex = CEFR_ORDER.indexOf(minCefr.toUpperCase());
  if (minIndex === -1) return words;
  return words.filter((w) => {
    const idx = CEFR_ORDER.indexOf((w.cefr || '').toUpperCase());
    return idx >= minIndex;
  });
}

// מנקה ומיישר שדות מילים שחולצו
function normalizeExtractedWords(words) {
  const arr = [];

  for (const w of words) {
    arr.push({
      word: String(w.word || '').trim(),
      definition: String(w.definition || '').trim(),
      cefr: String(w.cefr || 'B1').toUpperCase(),
      context: String(w.context || '').trim(),
      translation: String(w.translation || '').trim(),
    });
  }

  return arr;
}

// מחזיר לקוח Prisma עם סוד DB
async function getPrisma() {
  if (prismaClient) return prismaClient;
  if (!process.env.DATABASE_URL && process.env.DATABASE_URL_SECRET_ARN) {
    const secret = await secrets.send(
      new GetSecretValueCommand({
        SecretId: process.env.DATABASE_URL_SECRET_ARN,
      }),
    );
    process.env.DATABASE_URL = secret.SecretString;
  }
  prismaClient = new PrismaClient();
  return prismaClient;
}

// שולף bucket ומפתח מאירוע SQS
function parseS3FromRecord(record) {
  const body = JSON.parse(record.body || '{}');
  const s3Record = body.Records?.[0];
  if (!s3Record?.s3?.bucket?.name || !s3Record?.s3?.object?.key) {
    throw new Error('SQS message does not contain an S3 event');
  }

  return {
    bucket: s3Record.s3.bucket.name,
    key: decodeURIComponent(s3Record.s3.object.key.replace(/\+/g, ' ')),
  };
}

// ממיר סטרים לבאפר בינארי
async function streamToBuffer(stream) {
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

// נסינו לעשות את התוצאה כמה שיותר דטרמינסטית ביכולות ובמשאבים שיש לנו
// שולח PDF ל-Bedrock ומחלץ מילים
async function extractWordsFromPdf(pdfBuffer, minCefr) {
  const client = new AnthropicBedrock({
    awsRegion: process.env.AWS_REGION || 'us-east-1',
  });
  const prompt = buildPrompt(minCefr);

  const request = {
    model: BEDROCK_MODEL_ID,
    max_tokens: 20000,
    temperature: 0,
    system: BEDROCK_SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'document',
            source: {
              type: 'base64',
              media_type: 'application/pdf',
              data: pdfBuffer.toString('base64'),
            },
          },
          { type: 'text', text: prompt },
        ],
      },
    ],
  };

  const response = await client.messages.create(request);
  const rawWords = parseBedrockResponse(response);
  return normalizeExtractedWords(filterByMinCefr(rawWords, minCefr));
}

// שומר מילים חדשות וכרטיסיות
async function saveExtractedWords(documentId, words) {
  const prisma = await getPrisma();
  const existingRows = await prisma.word.findMany({
    where: { documentId },
    select: { word: true },
  });
  const existingKeys = new Set(existingRows.map((row) => wordKey(row.word)));
  const filtered = words.filter((w) => !existingKeys.has(wordKey(w.word)));
  if (filtered.length === 0) return;

  await prisma.$transaction(async (tx) => {
    const createdWords = await tx.word.createManyAndReturn({
      data: filtered.map((w) => ({
        documentId,
        word: w.word,
        definition: w.definition,
        cefr: w.cefr,
        context: w.context,
        translation: w.translation,
      })),
    });

    await tx.flashcard.createMany({
      data: createdWords.map((word) => ({
        wordId: word.id,
        easeFactor: 2.5,
        interval: 0,
        repetitions: 0,
        nextReview: today(),
      })),
    });
  });
}

// מקצר הודעת שגיאה לשמירה
function formatProcessingError(err) {
  const raw = err?.message || String(err || 'Unknown processing error');
  return raw.replace(/\s+/g, ' ').trim().slice(0, 1000);
}

// בודק אם Bedrock לא יכול לעבד את הקובץ (503 בשגיאה)
function isUnprocessableBedrockError(err) {
  const message = formatProcessingError(err);
  return message.includes('503 Bedrock is unable to process your request');
}

// מסמן מסמך כנכשל בעיבוד
async function markDocumentFailed(documentId, err, processingError = null) {
  const prisma = await getPrisma();
  await prisma.document.update({
    where: { id: documentId },
    data: {
      processingStatus: 'failed',
      processingError: processingError ?? formatProcessingError(err),
    },
  });
}

// מעבד רשומת S3 עד סטטוס מוכן
export async function processS3Record(record) {
  const { bucket, key } = parseS3FromRecord(record);
  const prisma = await getPrisma();
  const document = await prisma.document.findFirst({
    where: {
      s3Key: key,
      processingStatus: 'processing',
    },
  });
  if (!document) {
    console.warn('No matching processing document for s3 object', { bucket, key });
    return;
  }

  try {
    const object = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    const pdfBuffer = await streamToBuffer(object.Body);
    const words = await extractWordsFromPdf(pdfBuffer, document.minCefr);
    await saveExtractedWords(document.id, words);
    await prisma.document.update({
      where: { id: document.id },
      data: {
        processingStatus: 'ready',
        processedAt: new Date(),
        processingError: null,
      },
    });
  } catch (err) {
    console.error(`[document:${document.id}] lambda processing failed`, err);
    if (isUnprocessableBedrockError(err)) {
      await markDocumentFailed(document.id, err, 'UNPROCESSABLE_FILE');
      return;
    }
    // Keep status `processing` so SQS retries can find the row. Mark failed only
    // after redrive threshold (align with queue maxReceiveCount / DLQ).
    const receiveCount = Number(record.attributes?.ApproximateReceiveCount || '1');
    const maxReceiveCount = Number(process.env.SQS_MAX_RECEIVE_COUNT || '5');
    if (receiveCount >= maxReceiveCount) {
      await markDocumentFailed(document.id, err);
    }
    throw err;
  }
}
