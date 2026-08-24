export const CSV_COLUMNS = 'word,definition,cefr,context,translation';

const CEFR_ORDER = ['B1', 'B2', 'C1', 'C2'];
const CSV_HEADER_RE = /^word,definition,cefr,context,translation$/i;
const CSV_HEADER_PREFIX_RE = /^word,definition,cefr,context,translation/i;
const CSV_BLOCK_RE = /word,definition,cefr,context,translation[\s\S]*/i;

// מסיר ` markdown מתשובה
function stripMarkdownFences(text) {
  const fenced = text.match(/```(?:csv)?\s*([\s\S]*?)```/i);
  return (fenced ? fenced[1] : text).trim();
}

// שולף בלוק CSV מהטקסט
function extractCsvPayload(text) {
  const cleaned = stripMarkdownFences(text);
  const match = cleaned.match(CSV_BLOCK_RE);
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
  if (!CSV_HEADER_RE.test(headerLine)) {
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
export function parseBedrockResponse(response) {
  const textBlocks = (response.content || [])
    .filter((block) => block.type === 'text' && block.text)
    .map((block) => block.text);
  const text = textBlocks.join('\n').trim();

  if (!text) {
    throw new Error('No text found in Bedrock response');
  }

  const csvPayload = extractCsvPayload(text);
  if (CSV_HEADER_PREFIX_RE.test(csvPayload)) {
    return mapWordsArray(parseCsvWordsPayload(csvPayload));
  }

  throw new Error('Invalid CSV response: missing header row');
}
