import { extractText, getDocumentProxy } from 'unpdf';

const WORD_BOUNDARY_RE_SPECIALS = /[.*+?^${}()|[\]\\]/g;
const SENTENCE_BOUNDARY_RE = /[.!?]["']?\s+[A-Z]/;
const MAX_CONTEXT_LINE_SPAN = 3;
const LATIN_HEADWORD_RE = /^[\p{Script=Latin}\p{M}'-]+$/u;

// בורח תווי רגקס מיוחדים במילה
function escapeRegExp(text) {
  return String(text).replace(WORD_BOUNDARY_RE_SPECIALS, '\\$&');
}

function tokenBoundaryPattern(word, flags = 'u') {
  return new RegExp(
    `(?<![\\p{L}\\p{M}'-])${escapeRegExp(word)}(?![\\p{L}\\p{M}'-])`,
    flags,
  );
}

// בודק שהמילה מופיעה כטוקן שלם בטקסט מנורמל
function hasWordBoundaryMatch(word, text) {
  if (!word) return false;
  return tokenBoundaryPattern(word).test(text);
}

// מאחד רווחים לתצוגה בלי לשנות אותיות
function collapseDisplayWhitespace(text) {
  return String(text || '')
    .replace(/\u00AD/g, '')
    .replace(/([\p{L}\p{M}])-\s*\n\s*([\p{L}\p{M}])/gu, '$1$2')
    .replace(/\s+/g, ' ')
    .trim();
}

// מוצא את כל מופעי המילה כטוקן שלם
function findWordOccurrences(text, word) {
  const pattern = tokenBoundaryPattern(word, 'giu');
  const occurrences = [];
  let match = pattern.exec(text);
  while (match) {
    occurrences.push({ index: match.index, length: match[0].length });
    match = pattern.exec(text);
  }
  return occurrences;
}

// מרחיב ציטוט מתא הגדרה כך שיכלול את המילה מאותה שורה/מעטפת
function expandContextToIncludeWord(word, context, sourceText) {
  const normalizedWord = normalizeSourceText(word);
  const normalizedContext = normalizeSourceText(context);
  if (!normalizedWord || !normalizedContext) return null;

  const lines = String(sourceText || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  for (let span = 1; span <= MAX_CONTEXT_LINE_SPAN; span += 1) {
    for (let i = 0; i + span <= lines.length; i += 1) {
      const windowText = collapseDisplayWhitespace(lines.slice(i, i + span).join(' '));
      const normalizedWindow = normalizeContextMatchText(windowText);
      if (!normalizedWindow.includes(normalizeContextMatchText(context))) continue;

      const contextIndex = windowText.toLowerCase().indexOf(collapseDisplayWhitespace(context).toLowerCase());
      if (contextIndex === -1) continue;

      const contextEnd = contextIndex + collapseDisplayWhitespace(context).length;
      const occurrences = findWordOccurrences(windowText, word);
      const nearby = occurrences.find((occurrence) => {
        const wordEnd = occurrence.index + occurrence.length;
        const betweenStart = Math.min(wordEnd, contextIndex);
        const betweenEnd = Math.max(occurrence.index, contextEnd);
        const between = windowText.slice(betweenStart, betweenEnd);
        return !SENTENCE_BOUNDARY_RE.test(between);
      });
      if (!nearby) continue;

      const start = Math.min(nearby.index, contextIndex);
      const end = Math.max(nearby.index + nearby.length, contextEnd);
      const expanded = collapseDisplayWhitespace(windowText.slice(start, end));
      if (hasWordBoundaryMatch(normalizedWord, normalizeSourceText(expanded))) {
        return expanded;
      }
    }
  }

  return null;
}

// מנרמל טקסט מקור להשוואה
export function normalizeSourceText(text) {
  return String(text || '')
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
    .replace(/\u00AD/g, '')
    .replace(/([\p{L}\p{M}])-\s*\n\s*([\p{L}\p{M}])/gu, '$1$2')
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .trim();
}

// משווה הקשר בלי פסיקים עודפים מהמודל
function normalizeContextMatchText(text) {
  return normalizeSourceText(text)
    .replace(/,/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// מחלץ טקסט גולמי מ-PDF
export async function extractPdfText(pdfBuffer) {
  const pdf = await getDocumentProxy(new Uint8Array(pdfBuffer));
  const { text } = await extractText(pdf, { mergePages: true });
  return String(text || '').trim();
}

// מסנן מילים שאין להן עיגון בטקסט המקור
export function filterWordsBySource(words, sourceText) {
  if (!String(sourceText || '').trim()) {
    return { kept: words, dropped: [] };
  }

  const normalizedSource = normalizeSourceText(sourceText);
  const kept = [];
  const dropped = [];

  for (const entry of words) {
    const word = String(entry.word || '').trim();
    const context = String(entry.context || '').trim();
    const normalizedWord = normalizeSourceText(word);
    const normalizedContext = normalizeSourceText(context);
    const matchSource = normalizeContextMatchText(sourceText);
    const matchContext = normalizeContextMatchText(context);

    if (!LATIN_HEADWORD_RE.test(normalizedWord) || !hasWordBoundaryMatch(normalizedWord, normalizedSource)) {
      dropped.push({ ...entry, reason: 'word_not_in_pdf' });
      continue;
    }

    if (!matchContext || !matchSource.includes(matchContext)) {
      dropped.push({ ...entry, reason: 'context_not_in_pdf' });
      continue;
    }

    let groundedContext = context;
    let groundedNormalizedContext = normalizedContext;
    if (!hasWordBoundaryMatch(normalizedWord, groundedNormalizedContext)) {
      const expanded = expandContextToIncludeWord(word, context, sourceText);
      if (expanded) {
        groundedContext = expanded;
        groundedNormalizedContext = normalizeSourceText(expanded);
      }
    }

    if (!hasWordBoundaryMatch(normalizedWord, groundedNormalizedContext)) {
      dropped.push({ ...entry, reason: 'word_not_in_context' });
      continue;
    }

    if (!matchSource.includes(normalizeContextMatchText(groundedContext))) {
      dropped.push({ ...entry, reason: 'context_not_in_pdf' });
      continue;
    }

    kept.push({ ...entry, context: groundedContext });
  }

  return { kept, dropped };
}
