import assert from 'node:assert/strict';
import { splitMarkdownForExtraction } from '../src/utils/textSplitter.js';

const fillerParagraph =
  'Academic research requires careful reading and sustained attention to detail across many pages of material. ';

function repeatText(text, targetLength) {
  let result = '';
  while (result.length < targetLength) {
    result += text;
  }
  return result.slice(0, targetLength);
}

const shortText = repeatText(fillerParagraph, 5_000);
const chunksForShort = splitMarkdownForExtraction(shortText, {
  singlePassLimit: 24_000,
  chunkMax: 12_000,
  chunkOverlap: 300,
});
assert.equal(chunksForShort.length, 1, 'short text should stay in a single chunk');
assert.equal(chunksForShort[0], shortText);

const headerText = [
  '# Introduction',
  repeatText(fillerParagraph, 10_000),
  '## Methods',
  repeatText(fillerParagraph, 10_000),
  '## Conclusion',
  repeatText(fillerParagraph, 10_000),
].join('\n\n');

const headerChunks = splitMarkdownForExtraction(headerText, {
  singlePassLimit: 24_000,
  chunkMax: 6_000,
  chunkOverlap: 0,
});
assert.ok(headerChunks.length >= 3, 'markdown headers should produce multiple chunks');
assert.ok(
  headerChunks.some((chunk) => chunk.includes('# Introduction')),
  'first section header should be preserved',
);
assert.ok(
  headerChunks.some((chunk) => chunk.includes('## Conclusion')),
  'last section header should be preserved',
);

const longPlainText = `${repeatText(`${fillerParagraph}\n\n`, 29_800)}END_MARKER_TAIL_SECTION`;
const longChunks = splitMarkdownForExtraction(longPlainText, {
  singlePassLimit: 24_000,
  chunkMax: 12_000,
  chunkOverlap: 300,
});
assert.ok(longChunks.length > 1, 'long plain text should be split into multiple chunks');
for (const chunk of longChunks) {
  assert.ok(chunk.length <= 12_000 + 300, 'chunk should respect max size with overlap allowance');
}
assert.ok(
  longChunks[longChunks.length - 1].includes('END_MARKER_TAIL_SECTION'),
  'final chunk should include text from the end of the document',
);

const overlapChunks = splitMarkdownForExtraction(longPlainText, {
  singlePassLimit: 24_000,
  chunkMax: 10_000,
  chunkOverlap: 300,
});
assert.ok(overlapChunks.length > 1, 'overlap mode should still produce multiple chunks');
assert.ok(
  overlapChunks[overlapChunks.length - 1].includes('END_MARKER_TAIL_SECTION'),
  'overlapping chunks should still reach the document tail',
);

console.log('textSplitter tests passed');
