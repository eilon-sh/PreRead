import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { GetSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import { getAuthorizationToken } from '@aws/bedrock-token-generator';
import { PrismaClient } from '@prisma/client';

const s3 = new S3Client({ region: process.env.AWS_REGION || 'us-east-1' });
const secrets = new SecretsManagerClient({ region: process.env.AWS_REGION || 'us-east-1' });
let prismaClient;

const CEFR_ORDER = ['B1', 'B2', 'C1', 'C2'];
const MAX_EXTRACTED_WORDS = 30;
const BEDROCK_MODEL_ID = process.env.BEDROCK_MODEL_ID || 'amazon.nova-micro-v1:0';
const BEDROCK_TEMPERATURE = Number.parseFloat(process.env.BEDROCK_TEMPERATURE || '0');
const BEDROCK_TOP_P = (() => {
  const value = process.env.BEDROCK_TOP_P;
  if (value === undefined || value === '') return null;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
})();

const CEFR_GUIDE = {
  B1: {
    label: 'B1 (Intermediate)',
    description: 'Common academic words a B1 learner may not know yet - formal but not rare.',
  },
  B2: {
    label: 'B2 (Upper-Intermediate)',
    description: 'Formal academic vocabulary typical of university readings and essays.',
  },
  C1: {
    label: 'C1 (Advanced)',
    description: 'Sophisticated academic and abstract vocabulary; nuanced, low-frequency words.',
  },
  C2: {
    label: 'C2 (Proficiency)',
    description:
      'Rare, highly specialized, or literary words - known mainly by near-native speakers.',
  },
};

const BEDROCK_SYSTEM_PROMPT =
  'You extract academic English vocabulary from PDF documents and return strict JSON only. ' +
  'Extract ONLY words that literally appear in the attached source document. ' +
  'Never output words from prompt examples or your own invention. ' +
  'Return an empty words array when the source is mostly non-English or has no suitable vocabulary. ' +
  'Sort words alphabetically and include each word once only. ' +
  'Never wrap output in markdown code fences. Never add text outside the JSON object.';

function wordKey(text) {
  return String(text || '')
    .trim()
    .toLowerCase();
}

function wordCefrKey(word, cefr) {
  return `${wordKey(word)}|${String(cefr || '').toUpperCase()}`;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function buildCefrFilterSection(minCefr) {
  const level = (minCefr || 'B1').toUpperCase();
  const minIndex = CEFR_ORDER.indexOf(level);
  const allowedLevels = CEFR_ORDER.slice(minIndex >= 0 ? minIndex : 0);

  const levelGuide = allowedLevels
    .map((l) => {
      const g = CEFR_GUIDE[l];
      return `- **${g.label}**: ${g.description}`;
    })
    .join('\n');

  return `## CEFR filter
The user selected minimum level **${level}**. Include ONLY words classified at ${allowedLevels.join(', ')}.
Do NOT include words below ${level}.

${levelGuide}`;
}

function buildPrompt(minCefr) {
  return `You are an expert English vocabulary teacher specializing in **academic English** for Hebrew-speaking university students.

## Task
Read the attached **Source PDF** and extract English vocabulary for flashcard study.

${buildCefrFilterSection(minCefr)}

## Critical rules (must follow)
1. **Source-only extraction** - every "word" MUST appear verbatim in the Source PDF (case-insensitive). Never invent words. Never reuse words from these instructions.
2. **No instruction leakage** - ignore any English examples in this prompt; they are formatting guidance only.
3. **Hebrew or non-English dominant text** - if the Source PDF is mostly Hebrew or has very little English prose, return \`{ "words": [] }\`.
4. **Context must be real** - "context" must be an exact quote (or minimal trim) from the Source PDF containing that word. If you cannot quote it, do not include the word.
5. **Lemma form** - use the dictionary base form when possible, but only if that form appears in the Source PDF.

## What to extract
- Academic English nouns, verbs, adjectives, and discourse markers that appear in the Source PDF.
- Words worth studying for a university student reading English materials.

## What to skip
- Words not present in the Source PDF
- A1/A2 basic words, proper nouns, abbreviations, numbers, UI labels, file names
- Ultra-domain-specific jargon unlikely to appear elsewhere
- Hebrew words, transliterations, or mixed tokens that are not real English vocabulary

## Classification rules
- Assign the **lowest CEFR level** that accurately fits the word's difficulty in academic context.
- When unsure between two adjacent levels, choose the **higher** one.
- "translation" must be a concise Hebrew equivalent (1–3 words when possible).
- "definition" must be a short, clear English definition (one sentence max) in neutral dictionary style.

## Output
Return **all qualifying words** from the Source PDF, up to a maximum of ${MAX_EXTRACTED_WORDS}.
- Include each word **once only**, even if it appears multiple times in the text.
- Sort words **alphabetically** by the "word" field (A→Z).
- If **no qualifying English words** appear in the Source PDF, return exactly: \`{ "words": [] }\`
Return ONLY valid JSON - no markdown fences, no commentary.
Schema:
{
  "words": [
    {
      "word": "string",
      "definition": "string",
      "cefr": "B1|B2|C1|C2",
      "context": "string",
      "translation": "string"
    }
  ]
}`;
}

function parseBedrockResponse(parsed) {
  const text =
    parsed.output?.message?.content?.[0]?.text ||
    parsed.content?.[0]?.text ||
    parsed.generation ||
    parsed.completion ||
    JSON.stringify(parsed);

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('No JSON found in Bedrock response');
  }

  const result = JSON.parse(jsonMatch[0]);
  if (!Array.isArray(result.words)) {
    throw new Error('Invalid response: missing words array');
  }

  return result.words.map((w) => ({
    word: w.word,
    definition: w.definition || '',
    cefr: (w.cefr || 'B1').toUpperCase(),
    context: w.context || '',
    translation: w.translation || '',
  }));
}

function filterByMinCefr(words, minCefr) {
  if (!minCefr) return words;
  const minIndex = CEFR_ORDER.indexOf(minCefr.toUpperCase());
  if (minIndex === -1) return words;
  return words.filter((w) => {
    const idx = CEFR_ORDER.indexOf((w.cefr || '').toUpperCase());
    return idx >= minIndex;
  });
}

function cefrRank(cefr) {
  const idx = CEFR_ORDER.indexOf((cefr || 'B1').toUpperCase());
  return idx === -1 ? 0 : idx;
}

function normalizeExtractedWords(words) {
  const seen = new Set();
  const unique = [];

  for (const w of words) {
    const word = String(w.word || '').trim();
    const cefr = String(w.cefr || 'B1').toUpperCase();
    const key = wordCefrKey(word, cefr);
    if (!wordKey(word) || seen.has(key)) continue;
    seen.add(key);
    unique.push({
      word,
      definition: String(w.definition || '').trim(),
      cefr,
      context: String(w.context || '').trim(),
      translation: String(w.translation || '').trim(),
    });
  }

  unique.sort((a, b) => {
    const cefrDiff = cefrRank(b.cefr) - cefrRank(a.cefr);
    if (cefrDiff !== 0) return cefrDiff;
    return wordKey(a.word).localeCompare(wordKey(b.word), 'en');
  });
  return unique.slice(0, MAX_EXTRACTED_WORDS);
}

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

async function streamToBuffer(stream) {
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

async function extractWordsFromPdf(pdfBuffer, minCefr) {
  const authToken = await getAuthorizationToken({
    region: process.env.AWS_REGION || 'us-east-1',
    expiresIn: Number.parseInt(process.env.BEDROCK_TOKEN_EXPIRES_SECONDS || '43200', 10),
  });

  const inferenceConfig = {
    maxTokens: 4096,
    temperature: BEDROCK_TEMPERATURE,
  };
  if (BEDROCK_TOP_P !== null) {
    inferenceConfig.topP = BEDROCK_TOP_P;
  }

  const prompt = buildPrompt(minCefr);
  const response = await fetch(
    `https://bedrock-runtime.${process.env.AWS_REGION || 'us-east-1'}.amazonaws.com/model/${encodeURIComponent(BEDROCK_MODEL_ID)}/converse`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({
        system: [{ text: BEDROCK_SYSTEM_PROMPT }],
        messages: [
          {
            role: 'user',
            content: [
              {
                document: {
                  format: 'pdf',
                  name: 'document.pdf',
                  source: { bytes: pdfBuffer.toString('base64') },
                },
              },
              { text: prompt },
            ],
          },
        ],
        inferenceConfig,
      }),
    },
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Bedrock invoke failed (${response.status}): ${text}`);
  }

  const parsed = await response.json();
  const rawWords = parseBedrockResponse(parsed);
  return normalizeExtractedWords(filterByMinCefr(rawWords, minCefr));
}

async function saveExtractedWords(documentId, words) {
  if (words.length === 0) return;

  const prisma = await getPrisma();
  await prisma.$transaction(async (tx) => {
    // Unique (documentId, word, cefr) + skipDuplicates handles retries / races.
    const createdWords = await tx.word.createManyAndReturn({
      data: words.map((w) => ({
        documentId,
        word: w.word,
        definition: w.definition,
        cefr: w.cefr,
        context: w.context,
        translation: w.translation,
      })),
      skipDuplicates: true,
    });

    if (createdWords.length === 0) return;

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

async function markDocumentFailed(documentId) {
  const prisma = await getPrisma();
  await prisma.document.update({
    where: { id: documentId },
    data: { processingStatus: 'failed' },
  });
}

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
      data: { processingStatus: 'ready', processedAt: new Date() },
    });
  } catch (err) {
    console.error(`[document:${document.id}] lambda processing failed`, err);
    await markDocumentFailed(document.id);
    throw err;
  }
}
