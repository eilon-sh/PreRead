import crypto from 'node:crypto';
import config from '#config.js';
import { splitMarkdownForExtraction } from '#utils/textSplitter.js';
import { getAuthorizationHeader } from './bedrockAuth.js';

export const CEFR_ORDER = ['B1', 'B2', 'C1', 'C2'];
const MAX_EXTRACTED_WORDS = 30;
const MAX_EXTRACTED_WORDS_PER_CHUNK = 15;
const EXTRACTION_CACHE_MAX = 100;
const extractionCache = new Map();

function wordKey(text) {
  return String(text || '')
    .trim()
    .toLowerCase();
}

function extractionCacheKey(markdown, minCefr) {
  return crypto
    .createHash('sha256')
    .update(markdown)
    .update('\0')
    .update((minCefr || 'B1').toUpperCase())
    .digest('hex');
}

function getCachedExtraction(cacheKey) {
  if (!config.bedrockExtractionCache) return null;

  const cached = extractionCache.get(cacheKey);
  if (!cached) return null;

  extractionCache.delete(cacheKey);
  extractionCache.set(cacheKey, cached);
  return cached;
}

function setCachedExtraction(cacheKey, words) {
  if (!config.bedrockExtractionCache) return;

  if (extractionCache.has(cacheKey)) {
    extractionCache.delete(cacheKey);
  }
  extractionCache.set(cacheKey, words);

  if (extractionCache.size > EXTRACTION_CACHE_MAX) {
    const oldestKey = extractionCache.keys().next().value;
    extractionCache.delete(oldestKey);
  }
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

function getMockWords() {
  return [
    {
      word: 'ubiquitous',
      definition: 'present, appearing, or found everywhere',
      cefr: 'C1',
      context: 'Smartphones have become ubiquitous in modern society.',
      translation: 'נוכח בכל מקום',
    },
    {
      word: 'meticulous',
      definition: 'showing great attention to detail; very careful',
      cefr: 'C1',
      context: 'She was meticulous in her research methodology.',
      translation: 'קפדני, מדוקדק',
    },
    {
      word: 'comprehend',
      definition: 'to understand something fully',
      cefr: 'B2',
      context: 'Students must comprehend the main ideas of the text.',
      translation: 'להבין, לתפוס',
    },
    {
      word: 'significant',
      definition: 'important or noticeable',
      cefr: 'B1',
      context: 'There was a significant increase in vocabulary scores.',
      translation: 'משמעותי',
    },
    {
      word: 'ephemeral',
      definition: 'lasting for a very short time',
      cefr: 'C2',
      context: 'The ephemeral nature of fashion trends fascinates sociologists.',
      translation: 'חולף, ארעי',
    },
  ];
}

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

function countLatinLetters(text) {
  return (text.match(/[a-zA-Z]/g) || []).length;
}

function countHebrewLetters(text) {
  return (text.match(/[\u0590-\u05FF]/g) || []).length;
}

function countEnglishTokens(text) {
  return (text.match(/\b[a-zA-Z]{3,}\b/g) || []).length;
}

export function hasExtractableEnglish(markdown) {
  const latin = countLatinLetters(markdown);
  const hebrew = countHebrewLetters(markdown);
  const englishTokens = countEnglishTokens(markdown);

  if (englishTokens < 5) return false;

  const letterTotal = latin + hebrew;
  if (letterTotal > 0 && latin / letterTotal < 0.15) return false;

  return true;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function wordAppearsInSource(word, markdown) {
  const normalizedWord = String(word || '')
    .trim()
    .toLowerCase();
  if (!normalizedWord) return false;

  const pattern = new RegExp(`\\b${escapeRegExp(normalizedWord)}\\b`, 'i');
  return pattern.test(markdown);
}

function filterWordsPresentInSource(words, markdown) {
  return words.filter((w) => wordAppearsInSource(w.word, markdown));
}

function cefrRank(cefr) {
  const idx = CEFR_ORDER.indexOf((cefr || 'B1').toUpperCase());
  return idx === -1 ? 0 : idx;
}

function normalizeExtractedWords(words) {
  const seen = new Set();
  const unique = [];

  for (const w of words) {
    const key = wordKey(w.word);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    unique.push(w);
  }

  unique.sort((a, b) => {
    const cefrDiff = cefrRank(b.cefr) - cefrRank(a.cefr);
    if (cefrDiff !== 0) return cefrDiff;
    return wordKey(a.word).localeCompare(wordKey(b.word), 'en');
  });
  return unique.slice(0, MAX_EXTRACTED_WORDS);
}

function buildPrompt(markdown, minCefr, { isChunk = false } = {}) {
  const maxWords = isChunk ? MAX_EXTRACTED_WORDS_PER_CHUNK : MAX_EXTRACTED_WORDS;
  const chunkNote = isChunk
    ? '\nThis Source text is one section of a longer document. Extract vocabulary from this section only.\n'
    : '';
  return `You are an expert English vocabulary teacher specializing in **academic English** for Hebrew-speaking university students.

## Task
Read the **Source text** at the end of this prompt and extract English vocabulary for flashcard study.
${chunkNote}
${buildCefrFilterSection(minCefr)}

## Critical rules (must follow)
1. **Source-only extraction** - every "word" MUST appear verbatim in the Source text (case-insensitive). Never invent words. Never reuse words from these instructions.
2. **No instruction leakage** - ignore any English examples in this prompt; they are formatting guidance only.
3. **Hebrew or non-English dominant text** - if the Source text is mostly Hebrew or has very little English prose, return \`{ "words": [] }\`.
4. **Context must be real** - "context" must be an exact quote (or minimal trim) from the Source text containing that word. If you cannot quote it, do not include the word.
5. **Lemma form** - use the dictionary base form when possible, but only if that form appears in the Source text.

## What to extract
- Academic English nouns, verbs, adjectives, and discourse markers that appear in the Source text.
- Words worth studying for a university student reading English materials.

## What to skip
- Words not present in the Source text
- A1/A2 basic words, proper nouns, abbreviations, numbers, UI labels, file names
- Ultra-domain-specific jargon unlikely to appear elsewhere
- Hebrew words, transliterations, or mixed tokens that are not real English vocabulary

## Classification rules
- Assign the **lowest CEFR level** that accurately fits the word's difficulty in academic context.
- When unsure between two adjacent levels, choose the **higher** one.
- "translation" must be a concise Hebrew equivalent (1–3 words when possible).
- "definition" must be a short, clear English definition (one sentence max) in neutral dictionary style.

## Output
Return **all qualifying words** from the Source text, up to a maximum of ${maxWords}.
- Include each word **once only**, even if it appears multiple times in the text.
- Sort words **alphabetically** by the "word" field (A→Z).
- If **no qualifying English words** appear in the Source text, return exactly: \`{ "words": [] }\`
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
}

## Source text
${markdown}`;
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

async function invokeBedrockConverse({ system, messages, maxTokens = 4096 }) {
  const url = `https://bedrock-runtime.${config.awsRegion}.amazonaws.com/model/${encodeURIComponent(config.bedrockModelId)}/converse`;
  const inferenceConfig = {
    maxTokens,
    temperature: config.bedrockTemperature,
  };

  if (config.bedrockTopP !== null) {
    inferenceConfig.topP = config.bedrockTopP;
  }

  const body = {
    messages,
    inferenceConfig,
  };

  if (system) {
    body.system = [{ text: system }];
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: await getAuthorizationHeader(),
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Bedrock invoke failed (${response.status}): ${errText}`);
  }
  return response.json();
}

async function runWithConcurrency(items, concurrency, worker) {
  if (items.length === 0) return [];

  const results = new Array(items.length);
  let nextIndex = 0;

  async function runWorker() {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await worker(items[index], index);
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => runWorker());
  await Promise.all(workers);
  return results;
}

const BEDROCK_SYSTEM_PROMPT =
  'You extract academic English vocabulary from texts and return strict JSON only. ' +
  'Extract ONLY words that literally appear in the user-provided Source text. ' +
  'Never output words from prompt examples or your own invention. ' +
  'Return an empty words array when the source is mostly non-English or has no suitable vocabulary. ' +
  'Sort words alphabetically and include each word once only. ' +
  'Never wrap output in markdown code fences. Never add text outside the JSON object.';

async function invokeExtractionPrompt(prompt) {
  const parsed = await invokeBedrockConverse({
    system: BEDROCK_SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: [{ text: prompt }],
      },
    ],
  });

  return parseBedrockResponse(parsed);
}

async function extractWordsFromChunk(chunk, minCefr, { isChunk = false } = {}) {
  const prompt = buildPrompt(chunk, minCefr, { isChunk });
  const rawWords = await invokeExtractionPrompt(prompt);
  return rawWords;
}

export async function extractWords(markdown, minCefr) {
  if (!hasExtractableEnglish(markdown)) {
    return [];
  }

  const cacheKey = extractionCacheKey(markdown, minCefr);
  const cached = getCachedExtraction(cacheKey);
  if (cached) {
    return cached;
  }

  let words;
  if (config.mockBedrock) {
    words = filterByMinCefr(filterWordsPresentInSource(getMockWords(), markdown), minCefr);
  } else {
    const chunks = splitMarkdownForExtraction(markdown, {
      singlePassLimit: config.extractionSinglePassLimit,
      chunkMax: config.extractionChunkMax,
      chunkOverlap: config.extractionChunkOverlap,
    });
    const isChunked = chunks.length > 1;

    const chunkResults = await runWithConcurrency(
      chunks,
      config.extractionChunkConcurrency,
      async (chunk) => extractWordsFromChunk(chunk, minCefr, { isChunk: isChunked }),
    );

    const rawWords = chunkResults.flat();
    const verifiedWords = filterWordsPresentInSource(rawWords, markdown);
    words = filterByMinCefr(verifiedWords, minCefr);
  }

  const normalized = normalizeExtractedWords(words);
  setCachedExtraction(cacheKey, normalized);
  return normalized;
}
