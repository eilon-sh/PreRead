import prisma from '#db/prisma.js';

export function mapWord(w) {
  return {
    id: w.id,
    document_id: w.documentId,
    word: w.word,
    definition: w.definition,
    cefr: w.cefr,
    context: w.context,
    translation: w.translation,
    filename: w.document.filename,
    flashcard_id: w.flashcard?.id,
    next_review: w.flashcard?.nextReview,
    repetitions: w.flashcard?.repetitions,
    interval: w.flashcard?.interval,
  };
}

export async function listWords(userId, { documentId } = {}) {
  const words = await prisma.word.findMany({
    where: {
      document: {
        userId,
        ...(documentId ? { id: documentId } : {}),
      },
    },
    include: {
      document: { select: { filename: true } },
      flashcard: true,
    },
    orderBy: { word: 'asc' },
  });

  const result = words.map(mapWord);

  return {
    words: result,
    total: result.length,
  };
}

export async function getWord(userId, id) {
  const word = await prisma.word.findFirst({
    where: {
      id,
      document: { userId },
    },
    include: {
      document: { select: { filename: true } },
      flashcard: true,
    },
  });

  if (!word) return null;

  return {
    ...mapWord(word),
    ease_factor: word.flashcard?.easeFactor,
  };
}
