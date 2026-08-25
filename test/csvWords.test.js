import assert from 'node:assert/strict';
import { parseBedrockResponse } from '../lambda/process-document/csvWords.js';

const csvResponse = (text) => ({
  content: [{ type: 'text', text }],
});

{
  const words = parseBedrockResponse(
    csvResponse(`word,definition,cefr,context,translation
hypothesis,"הסבר מוצע שנבדק במחקר",B2,"This hypothesis was tested",השערה
methodology,"שיטת המחקר והניתוח",C1,"The methodology was rigorous",מתודולוגיה`),
  );
  assert.equal(words.length, 2);
  assert.deepEqual(words[0], {
    word: 'hypothesis',
    definition: 'הסבר מוצע שנבדק במחקר',
    cefr: 'B2',
    context: 'This hypothesis was tested',
    translation: 'השערה',
  });
  assert.equal(words[1].word, 'methodology');
  assert.equal(words[1].cefr, 'C1');
}

{
  const words = parseBedrockResponse(
    csvResponse(`Here is the vocabulary:

\`\`\`csv
word,definition,cefr,context,translation
hypothesis,"הסבר מוצע",B2,"This hypothesis was tested",השערה
\`\`\`
`),
  );
  assert.equal(words.length, 1);
  assert.equal(words[0].word, 'hypothesis');
}

{
  const words = parseBedrockResponse(
    csvResponse(
      'word,definition,cefr,context,translation\nnote,"הערה קצרה, עם פסיק",B1,"In this note, we observe",הערה',
    ),
  );
  assert.equal(words.length, 1);
  assert.equal(words[0].definition, 'הערה קצרה, עם פסיק');
  assert.equal(words[0].context, 'In this note, we observe');
}

{
  const words = parseBedrockResponse(
    csvResponse(
      'word,definition,cefr,context,translation\nquote,"הגדרה עם ""מרכאות""",B2,"He said ""hello"" there",ציטוט',
    ),
  );
  assert.equal(words.length, 1);
  assert.equal(words[0].definition, 'הגדרה עם "מרכאות"');
  assert.equal(words[0].context, 'He said "hello" there');
}

{
  const words = parseBedrockResponse(
    csvResponse(
      'word,definition,cefr,context,translation\nanalysis,ניתוח,B2,The analysis, however, was incomplete,ניתוח',
    ),
  );
  assert.equal(words.length, 1);
  assert.equal(words[0].context, 'The analysis, however, was incomplete');
  assert.equal(words[0].translation, 'ניתוח');
}

{
  const words = parseBedrockResponse(
    csvResponse(`word,definition,cefr,context,translation
keep,"להשאיר",B2,"Please keep this",לשמור
drop,"להוריד",A2,"Please drop this",להפיל
also,"גם",C2,"Also include this",גם`),
  );
  assert.equal(words.map((w) => w.word).join(','), 'keep,also');
}

{
  const words = parseBedrockResponse(
    csvResponse('word,definition,cefr,context,translation'),
  );
  assert.deepEqual(words, []);
}

{
  assert.throws(
    () => parseBedrockResponse({ content: [] }),
    /No text found in Bedrock response/,
  );
  assert.throws(
    () => parseBedrockResponse(csvResponse('not a csv payload')),
    /Invalid CSV response: missing header row/,
  );
}

{
  const words = parseBedrockResponse(
    csvResponse(`WORD,DEFINITION,CEFR,CONTEXT,TRANSLATION
hypothesis,"הסבר מוצע",B2,"This hypothesis was tested",השערה`),
  );
  assert.equal(words.length, 1);
  assert.equal(words[0].word, 'hypothesis');
  assert.equal(words[0].cefr, 'B2');
}

{
  const words = parseBedrockResponse(
    csvResponse(`word, definition, cefr, context, translation
hypothesis,"הסבר מוצע",B2,"This hypothesis was tested",השערה`),
  );
  assert.equal(words.length, 1);
  assert.equal(words[0].word, 'hypothesis');
}

{
  const words = parseBedrockResponse(
    csvResponse(`return word,definition,cefr,context,translation please
word,definition,cefr,context,translation
hypothesis,"הסבר מוצע",B2,"This hypothesis was tested",השערה`),
  );
  assert.equal(words.length, 1);
  assert.equal(words[0].word, 'hypothesis');
}

{
  const words = parseBedrockResponse(
    csvResponse(`word,definition,cefr,context,translation
,empty word,B2,This was tested,ריק
keep,"להשאיר",B2,"Please keep this",לשמור`),
  );
  assert.equal(words.map((w) => w.word).join(','), 'keep');
}

{
  const words = parseBedrockResponse(
    csvResponse(
      'word,definition,cefr,context,translation\nanalysis,ניתוח,B2,The analysis however was incomplete,ניתוח,',
    ),
  );
  assert.equal(words.length, 0);
}

{
  const words = parseBedrockResponse(
    csvResponse(
      'word,definition,cefr,context,translation\nanalysis,ניתוח,B2,The analysis was incomplete,ni,extra',
    ),
  );
  assert.equal(words.length, 0);
}

console.log('csvWords tests passed');

