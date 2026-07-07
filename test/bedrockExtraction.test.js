import assert from 'node:assert/strict';

process.env.MOCK_BEDROCK = 'true';

const { extractWords } = await import('../src/services/bedrockService.js');
const { default: config } = await import('../src/config.js');

assert.equal(config.mockBedrock, true, 'mock bedrock should be enabled for extraction test');

const filler =
  'Academic research requires careful reading and sustained attention to detail across many pages. ';
const padding = filler.repeat(Math.ceil(26_000 / filler.length));
const tail =
  'The ubiquitous nature of technology is significant in modern education. ' +
  'Students must comprehend meticulous research methods to achieve their goals. ' +
  'This ephemeral moment in learning can help build vocabulary skills.';
const longMarkdown = `${padding}\n\n${tail}`;

assert.ok(
  longMarkdown.length > config.extractionSinglePassLimit,
  'fixture should exceed single-pass limit',
);

const words = await extractWords(longMarkdown, 'B1');
const extracted = new Set(words.map((w) => w.word.toLowerCase()));

assert.ok(extracted.has('ubiquitous'), 'should extract ubiquitous from the tail section');
assert.ok(extracted.has('ephemeral'), 'should extract ephemeral from the tail section');
assert.ok(words.length <= 30, 'should cap merged results at 30 words');

if (words.length >= 2) {
  const levels = ['B1', 'B2', 'C1', 'C2'];
  const firstRank = levels.indexOf(words[0].cefr);
  const secondRank = levels.indexOf(words[1].cefr);
  assert.ok(firstRank >= secondRank, 'words should be ranked by descending CEFR level');
}

console.log('bedrockExtraction tests passed');
