import assert from 'node:assert/strict';
import {
  filterWordsBySource,
  normalizeSourceText,
} from '../lambda/process-document/sourceGrounding.js';

const sample = (overrides = {}) => ({
  word: 'hypothesis',
  definition: 'הסבר מוצע שנבדק במחקר',
  cefr: 'B2',
  context: 'This hypothesis was tested',
  translation: 'השערה',
  ...overrides,
});

{
  const { kept, dropped } = filterWordsBySource(
    [sample()],
    'This hypothesis was tested in the study.',
  );
  assert.equal(kept.length, 1);
  assert.equal(dropped.length, 0);
  assert.equal(kept[0].word, 'hypothesis');
}

{
  const { kept, dropped } = filterWordsBySource(
    [sample({ word: 'flibbertigibbet', context: 'A flibbertigibbet was tested' })],
    'This hypothesis was tested in the study.',
  );
  assert.equal(kept.length, 0);
  assert.equal(dropped.length, 1);
  assert.equal(dropped[0].reason, 'word_not_in_pdf');
}

{
  const { kept, dropped } = filterWordsBySource(
    [sample({ context: 'Researchers later verified this hypothesis' })],
    'This hypothesis was tested in the study.',
  );
  assert.equal(kept.length, 0);
  assert.equal(dropped.length, 1);
  assert.equal(dropped[0].reason, 'context_not_in_pdf');
}

{
  const { kept, dropped } = filterWordsBySource(
    [sample({ context: 'The methodology was rigorous' })],
    'The hypothesis is new. The methodology was rigorous.',
  );
  assert.equal(kept.length, 0);
  assert.equal(dropped.length, 1);
  assert.equal(dropped[0].reason, 'word_not_in_context');
}

{
  const { kept, dropped } = filterWordsBySource(
    [
      sample({
        word: 'actuary',
        context: 'a person who calculates risks for insurance companies',
      }),
    ],
    '1\tactuary\tn. a person who calculates risks for insurance companies',
  );
  assert.equal(dropped.length, 0);
  assert.equal(kept.length, 1);
  assert.equal(kept[0].context, 'actuary n. a person who calculates risks for insurance companies');
}

{
  const { kept, dropped } = filterWordsBySource(
    [
      sample({
        word: 'agency',
        context: 'company specialising in producing and placing advertisements for clients',
      }),
    ],
    '3\tadvertising agency\tn. company specialising in producing and placing advertisements for\nclients',
  );
  assert.equal(dropped.length, 0);
  assert.equal(kept.length, 1);
  assert.equal(
    kept[0].context,
    'agency n. company specialising in producing and placing advertisements for clients',
  );
}

{
  const { kept, dropped } = filterWordsBySource(
    [
      sample({
        word: 'actuary',
        context: 'a person who calculates risks for insurance companies',
      }),
    ],
    '1\nactuary\nn. a person who calculates risks for insurance companies',
  );
  assert.equal(dropped.length, 0);
  assert.equal(kept.length, 1);
  assert.equal(kept[0].context, 'actuary n. a person who calculates risks for insurance companies');
}

{
  assert.equal(normalizeSourceText('imple-\nmentation'), 'implementation');
  assert.equal(normalizeSourceText('This   hypothesis\nwas tested'), 'this hypothesis was tested');
  assert.equal(normalizeSourceText('“Hello” world'), '"hello" world');

  const { kept, dropped } = filterWordsBySource(
    [
      sample({
        word: 'implementation',
        context: 'The implementation of this hypothesis was tested.',
      }),
    ],
    'The imple-\nmentation of this   hypothesis\nwas tested.',
  );
  assert.equal(kept.length, 1);
  assert.equal(dropped.length, 0);
}

{
  const input = [sample({ word: 'notinthepdf' })];
  const { kept, dropped } = filterWordsBySource(input, '');
  assert.equal(kept, input);
  assert.equal(dropped.length, 0);

  const missing = filterWordsBySource(input, null);
  assert.equal(missing.kept, input);
  assert.equal(missing.dropped.length, 0);
}

{
  const { kept, dropped } = filterWordsBySource([sample()], 'השערה זו נבדקה במחקר.');
  assert.equal(kept.length, 0);
  assert.equal(dropped.length, 1);
  assert.equal(dropped[0].reason, 'word_not_in_pdf');
}

{
  const { kept, dropped } = filterWordsBySource(
    [sample({ word: 'café', context: 'A café was tested' })],
    'A café was tested in the study.',
  );
  assert.equal(dropped.length, 0);
  assert.equal(kept.length, 1);
  assert.equal(kept[0].word, 'café');
}

{
  const { kept, dropped } = filterWordsBySource(
    [sample({ word: 'state', context: 'The nation-state was tested' })],
    'The nation-state was tested in the study.',
  );
  assert.equal(kept.length, 0);
  assert.equal(dropped[0].reason, 'word_not_in_pdf');
}

{
  const { kept, dropped } = filterWordsBySource(
    [sample({ word: 'analysis', context: 'The analysis, however, was incomplete' })],
    'The analysis however was incomplete.',
  );
  assert.equal(dropped.length, 0);
  assert.equal(kept.length, 1);
}

{
  assert.equal(normalizeSourceText('imple\u00ADmentation'), 'implementation');

  const { kept, dropped } = filterWordsBySource(
    [
      sample({
        word: 'implementation',
        context: 'The implementation of this hypothesis was tested.',
      }),
    ],
    'The imple\u00ADmentation of this hypothesis was tested.',
  );
  assert.equal(kept.length, 1);
  assert.equal(dropped.length, 0);
}

{
  const { kept, dropped } = filterWordsBySource(
    [sample({ word: 'the', context: 'A thesis was published' })],
    'A thesis was published.',
  );
  assert.equal(kept.length, 0);
  assert.equal(dropped[0].reason, 'word_not_in_pdf');
}

console.log('sourceGrounding tests passed');
