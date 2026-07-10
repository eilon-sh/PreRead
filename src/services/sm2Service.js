/**
 * SM-2 spaced-repetition scheduling for flashcards.
 *
 * Implements the SuperMemo 2 algorithm (Wozniak, 1987):
 * https://www.super-memory.com/english/ol/sm2.htm
 *
 * ## Implemented rules
 *
 * - **Initial E-Factor**: 2.5 (clamped to a minimum of 1.3 after each successful review)
 * - **Intervals**: I(1) = 1 day, I(2) = 6 days, I(n>2) = ceil(I(n-1) × EF)
 * - **E-Factor update** (successful reviews only, q ≥ 3):
 *   EF' = EF + (0.1 − (5−q) × (0.08 + (5−q) × 0.02))
 * - **Failed recall** (q < 3): reset repetitions to 0 and interval to 1 day; EF is unchanged
 *
 * ## Intentionally not implemented
 *
 * - **SM-2 rule 7**: same-day re-review of items scored below 4 until they reach 4+.
 *   Most modern flashcard apps omit this; cards simply reappear on their next scheduled date.
 *
 * @module sm2Service
 */

import prisma from '#db/prisma.js';
import { today } from '#utils/dateUtils.js';

/**
 * Add a number of calendar days to an ISO date string (YYYY-MM-DD).
 *
 * @param {string} dateStr - Base date in YYYY-MM-DD format
 * @param {number} days - Number of days to add
 * @returns {string} Resulting date in YYYY-MM-DD format
 */
function addDays(dateStr, days) {
  const d = new Date(`${dateStr}T12:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Apply one SM-2 review step to a flashcard.
 *
 * Quality scale (SM-2 standard):
 * - 5 - perfect response
 * - 4 - correct after hesitation (EF unchanged)
 * - 3 - correct with serious difficulty
 * - 2 - incorrect; correct answer seemed easy
 * - 1 - incorrect; correct answer remembered
 * - 0 - complete blackout
 *
 * @param {object} card - Current flashcard state
 * @param {number} card.easeFactor - E-Factor (easiness), default 2.5
 * @param {number} card.interval - Current interval in days
 * @param {number} card.repetitions - Count of consecutive successful reviews
 * @param {number} quality - Recall quality on the 0–5 SM-2 scale
 * @returns {{ easeFactor: number, interval: number, repetitions: number, nextReview: string, lastReviewed: string }}
 */
export function calculateSm2(card, quality) {
  let ef = card.easeFactor;
  let { interval, repetitions } = card;

  if (quality < 3) {
    // Failed recall: restart the repetition sequence without changing EF (SM-2 rule 6)
    repetitions = 0;
    interval = 1;
  } else {
    // Successful recall: compute the next interval, then update EF
    if (repetitions === 0) {
      interval = 1; // I(1)
    } else if (repetitions === 1) {
      interval = 6; // I(2)
    } else {
      // I(n) = ceil(I(n-1) × EF) - SM-2 rounds fractional intervals up
      interval = Math.ceil(interval * ef);
    }
    repetitions += 1;
    ef = ef + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
    if (ef < 1.3) ef = 1.3;
  }

  return {
    easeFactor: Math.round(ef * 100) / 100,
    interval,
    repetitions,
    nextReview: addDays(today(), interval),
    lastReviewed: today(),
  };
}

/**
 * Map a Prisma flashcard (with word + document) to the API response shape.
 *
 * @param {object} f - Flashcard row with nested word and document
 * @returns {object} Snake-cased due-card object for the API
 */
function mapDueCard(f) {
  return {
    flashcard_id: f.id,
    ease_factor: f.easeFactor,
    interval: f.interval,
    repetitions: f.repetitions,
    next_review: f.nextReview,
    last_reviewed: f.lastReviewed,
    word_id: f.word.id,
    word: f.word.word,
    definition: f.word.definition,
    cefr: f.word.cefr,
    context: f.word.context,
    translation: f.word.translation,
    document_id: f.word.documentId,
    filename: f.word.document.filename,
  };
}

/**
 * Fetch flashcards that are due for review (nextReview ≤ today).
 *
 * @param {object} [options]
 * @param {string} options.userId - Owner of the documents
 * @param {number} [options.documentId] - Optional filter to a single document
 * @param {number} [options.limit=50] - Maximum number of cards to return
 * @returns {Promise<object[]>} Due cards in API response format
 */
export async function getDueCards({ userId, documentId, limit = 50 } = {}) {
  const cards = await prisma.flashcard.findMany({
    where: {
      nextReview: { lte: today() },
      word: {
        document: {
          userId,
          ...(documentId ? { id: documentId } : {}),
        },
      },
    },
    include: {
      word: { include: { document: { select: { filename: true } } } },
    },
    orderBy: { nextReview: 'asc' },
    take: limit,
  });

  return cards.map(mapDueCard);
}

/**
 * Return review counts for the user's flashcard deck.
 *
 * @param {string} userId
 * @returns {Promise<{ total: number, dueToday: number }>}
 */
export async function getStats(userId) {
  const baseWhere = {
    word: { document: { userId } },
  };

  const [total, dueToday] = await Promise.all([
    prisma.flashcard.count({ where: baseWhere }),
    prisma.flashcard.count({
      where: { ...baseWhere, nextReview: { lte: today() } },
    }),
  ]);

  return { total, dueToday };
}
