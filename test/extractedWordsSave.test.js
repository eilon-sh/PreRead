import assert from 'node:assert/strict';
import { prepareExtractedWordsForSave } from '../lambda/process-document/extractedWordsSave.js';

const sample = (overrides = {}) => ({
  word: 'hypothesis',
  definition: 'הסבר',
  cefr: 'B2',
  context: 'This hypothesis was tested',
  translation: 'השערה',
  ...overrides,
});

{
  const prepared = prepareExtractedWordsForSave([
    sample({ word: '' }),
    sample({ word: '   ' }),
    sample({ word: 'keep' }),
  ]);
  assert.equal(prepared.length, 1);
  assert.equal(prepared[0].word, 'keep');
}

{
  const prepared = prepareExtractedWordsForSave([
    sample({ word: 'analysis', cefr: 'B2' }),
    sample({ word: 'Analysis', cefr: 'B2' }),
    sample({ word: 'analysis', cefr: 'C1' }),
  ]);
  assert.equal(prepared.length, 1);
  assert.equal(prepared[0].word, 'analysis');
  assert.equal(prepared[0].cefr, 'B2');
}

{
  const existing = new Set(['keep']);
  const prepared = prepareExtractedWordsForSave(
    [sample({ word: 'keep' }), sample({ word: 'new' })],
    existing,
  );
  assert.equal(prepared.length, 1);
  assert.equal(prepared[0].word, 'new');
}

console.log('extractedWordsSave tests passed');
