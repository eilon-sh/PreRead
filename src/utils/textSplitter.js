const MARKDOWN_HEADER_RE = /^(#{1,3}\s+.+)$/m;
const PARAGRAPH_SPLIT_RE = /\n\n+/;
const SENTENCE_SPLIT_RE = /(?<=[.!?])\s+/;

function splitByMarkdownHeaders(markdown) {
  const lines = markdown.split('\n');
  const sections = [];
  let current = [];

  for (const line of lines) {
    if (MARKDOWN_HEADER_RE.test(line) && current.length > 0) {
      sections.push(current.join('\n').trim());
      current = [line];
    } else {
      current.push(line);
    }
  }

  if (current.length > 0) {
    sections.push(current.join('\n').trim());
  }

  return sections.filter(Boolean);
}

function splitByParagraphs(text) {
  return text
    .split(PARAGRAPH_SPLIT_RE)
    .map((p) => p.trim())
    .filter(Boolean);
}

function splitBySentences(text) {
  return text
    .split(SENTENCE_SPLIT_RE)
    .map((s) => s.trim())
    .filter(Boolean);
}

function splitLargeText(text, chunkMax) {
  if (text.length <= chunkMax) {
    return [text];
  }

  const paragraphs = splitByParagraphs(text);
  if (paragraphs.length > 1) {
    return packPieces(paragraphs, chunkMax, '\n\n');
  }

  const sentences = splitBySentences(text);
  if (sentences.length > 1) {
    return packPieces(sentences, chunkMax, ' ');
  }

  const chunks = [];
  for (let i = 0; i < text.length; i += chunkMax) {
    chunks.push(text.slice(i, i + chunkMax));
  }
  return chunks;
}

function packPieces(pieces, chunkMax, separator) {
  const packed = [];
  let current = '';

  for (const piece of pieces) {
    if (piece.length > chunkMax) {
      if (current) {
        packed.push(current);
        current = '';
      }
      packed.push(...splitLargeText(piece, chunkMax));
      continue;
    }

    const candidate = current ? `${current}${separator}${piece}` : piece;
    if (candidate.length <= chunkMax) {
      current = candidate;
    } else {
      if (current) packed.push(current);
      current = piece;
    }
  }

  if (current) packed.push(current);
  return packed;
}

function mergeSmallChunks(chunks, chunkMax) {
  if (chunks.length <= 1) return chunks;

  const merged = [];
  let current = '';

  for (const chunk of chunks) {
    const candidate = current ? `${current}\n\n${chunk}` : chunk;
    if (candidate.length <= chunkMax) {
      current = candidate;
    } else {
      if (current) merged.push(current);
      current = chunk;
    }
  }

  if (current) merged.push(current);
  return merged;
}

function takeOverlapSuffix(text, overlap) {
  if (!overlap || overlap <= 0 || !text) return '';

  const suffix = text.slice(-overlap);
  const paragraphBreak = suffix.indexOf('\n\n');
  if (paragraphBreak !== -1) {
    return suffix.slice(paragraphBreak + 2);
  }

  const sentenceMatch = suffix.match(/[.!?]\s+(.*)$/s);
  if (sentenceMatch?.[1]) {
    return sentenceMatch[1];
  }

  return suffix;
}

function applyOverlap(chunks, overlap) {
  if (!overlap || overlap <= 0 || chunks.length <= 1) {
    return chunks;
  }

  const withOverlap = [chunks[0]];

  for (let i = 1; i < chunks.length; i++) {
    const prefix = takeOverlapSuffix(chunks[i - 1], overlap);
    if (!prefix) {
      withOverlap.push(chunks[i]);
      continue;
    }

    const combined = `${prefix}\n\n${chunks[i]}`;
    withOverlap.push(combined);
  }

  return withOverlap;
}

export function splitMarkdownForExtraction(markdown, options = {}) {
  const { singlePassLimit = 24_000, chunkMax = 12_000, chunkOverlap = 300 } = options;

  const text = String(markdown || '');
  if (!text || text.length <= singlePassLimit) {
    return [text];
  }

  const sections = splitByMarkdownHeaders(text);
  const rawChunks = sections.flatMap((section) => splitLargeText(section, chunkMax));
  const merged = mergeSmallChunks(rawChunks, chunkMax);

  return applyOverlap(merged, chunkOverlap);
}
