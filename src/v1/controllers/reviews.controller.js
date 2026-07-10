import { submitFlashcardReview } from '#services/reviewService.js';
import { getDueCards, getStats } from '#services/sm2Service.js';
import { parseBoundedLimit, parseIntOr, parseOptionalPositiveInt } from '#utils/parseIntUtils.js';

export async function getDue(req, res) {
  const documentId = parseOptionalPositiveInt(req.query.documentId);
  if (documentId === false) {
    return res.status(400).json({ error: 'Invalid documentId' });
  }

  const limit = parseBoundedLimit(req.query.limit, { defaultValue: 50, min: 1, max: 200 });
  if (limit === false) {
    return res.status(400).json({ error: 'limit must be an integer between 1 and 200' });
  }

  const cards = await getDueCards({
    userId: req.user.id,
    documentId,
    limit,
  });
  res.json({ count: cards.length, cards });
}

export async function getStatsHandler(req, res) {
  res.json(await getStats(req.user.id));
}

export async function submitReview(req, res) {
  try {
    const quality = parseIntOr(req.body.quality, null);
    if (quality === null || quality < 0 || quality > 5) {
      return res.status(400).json({ error: 'Quality must be an integer between 0 and 5' });
    }

    const flashcardId = parseIntOr(req.params.id, null);
    if (flashcardId === null) {
      return res.status(400).json({ error: 'Invalid flashcard id' });
    }
    const result = await submitFlashcardReview(req.user.id, flashcardId, quality);

    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}
