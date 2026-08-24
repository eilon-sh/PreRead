import prisma from '#db/prisma.js';
import config from '#config.js';
import { calculateSm2 } from '#services/sm2Service.js';
import { processReview } from './gameService.js';

const LOCAL_TX_OPTIONS = config.isProduction ? undefined : { maxWait: 10_000, timeout: 20_000 };

// מעדכן כרטיס ומעניק XP
export async function submitFlashcardReview(userId, flashcardId, quality) {
  return prisma.$transaction(async (tx) => {
    const card = await tx.flashcard.findFirst({
      where: {
        id: flashcardId,
        word: { document: { userId } },
      },
    });

    if (!card) {
      throw new Error('Flashcard not found');
    }

    const updated = calculateSm2(card, quality);
    const result = await tx.flashcard.update({
      where: { id: flashcardId },
      data: updated,
    });

    const gameResult = await processReview(userId, quality, card, tx);

    return {
      ...card,
      ease_factor: result.easeFactor,
      interval: result.interval,
      repetitions: result.repetitions,
      next_review: result.nextReview,
      last_reviewed: result.lastReviewed,
      quality,
      game: gameResult,
    };
  }, LOCAL_TX_OPTIONS);
}
