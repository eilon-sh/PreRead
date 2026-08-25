export const CSV_COLUMNS = 'word,definition,cefr,context,translation';

const CEFR_ORDER = ['B1', 'B2', 'C1', 'C2'];
const CSV_HEADER_COLUMNS = CSV_COLUMNS.split(',');
const HEBREW_RE = /[\u0590-\u05FF]/;

// מסיר ` markdown מתשובה
function stripMarkdownFences(text) {
  const fenced = text.match(/```(?:csv)?\s*([\s\S]*?)```/i);
  return (fenced ? fenced[1] : text).trim();
}

// מנרמל שמות עמודות להשוואה לכותרת
function normalizeHeaderColumns(line) {
  return parseCsvFields(line).map((column) => column.trim().toLowerCase());
}

function isCsvHeaderLine(line) {
  const columns = normalizeHeaderColumns(line);
  return (
    columns.length === CSV_HEADER_COLUMNS.length &&
    columns.every((column, index) => column === CSV_HEADER_COLUMNS[index])
  );
}

// שולף בלוק CSV החל משורת כותרת מדויקת
function extractCsvPayload(text) {
  const cleaned = stripMarkdownFences(text);
  const lines = cleaned.split(/\r?\n/);
  const headerIndex = lines.findIndex((line) => isCsvHeaderLine(line.trim()));
  if (headerIndex === -1) return cleaned.trim();
  return lines.slice(headerIndex).join('\n').trim();
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

// מתקן עמודות כשיש פסיקים עודפים ב-context בלבד
function normalizeCsvWordFields(fields, columnCount) {
  if (fields.length === columnCount) return fields;
  if (fields.length < columnCount) return null;
  if (columnCount !== 5) return null;
  if (!isLikelyWordRow(fields)) return null;

  const translation = String(fields.at(-1) || '').trim();
  if (!translation || !HEBREW_RE.test(translation)) return null;

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
  if (!isCsvHeaderLine(headerLine)) {
    throw new Error('Invalid CSV response: missing header row');
  }

  const columns = normalizeHeaderColumns(headerLine);
  const words = [];

  for (const line of lines.slice(1)) {
    const parsed = normalizeCsvWordFields(parseCsvFields(line), columns.length);
    if (!parsed || !isLikelyWordRow(parsed)) continue;
    if (!String(parsed[0] || '').trim()) continue;

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
  if (isCsvHeaderLine(csvPayload.split(/\r?\n/)[0] || '')) {
    return mapWordsArray(parseCsvWordsPayload(csvPayload));
  }

  throw new Error('Invalid CSV response: missing header row');
}
