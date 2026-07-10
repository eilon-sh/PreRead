import { awardMinigameXp, getGameWords } from '#services/minigameService.js';
import { parseBoundedLimit, parseOptionalPositiveInt } from '#utils/parseIntUtils.js';

const GAME_TYPES = new Set(['fill', 'match', 'quiz']);

export async function getWords(req, res) {
  const { cefr } = req.query;

  const documentId = parseOptionalPositiveInt(req.query.documentId);
  if (documentId === false) {
    return res.status(400).json({ error: 'Invalid documentId' });
  }

  const limit = parseBoundedLimit(req.query.limit, { defaultValue: 20, min: 1, max: 50 });
  if (limit === false) {
    return res.status(400).json({ error: 'limit must be an integer between 1 and 50' });
  }

  const words = await getGameWords(req.user.id, {
    cefr: cefr || null,
    documentId,
    limit,
  });

  res.json({ words, total: words.length });
}

export async function complete(req, res) {
  const { correct, total, gameType } = req.body;

  if (
    !Number.isInteger(correct) ||
    !Number.isInteger(total) ||
    typeof gameType !== 'string' ||
    !GAME_TYPES.has(gameType)
  ) {
    return res.status(400).json({ error: 'נתונים לא תקינים' });
  }

  if (total < 1 || total > 100 || correct < 0 || correct > total) {
    return res.status(400).json({ error: 'נתונים לא תקינים' });
  }

  const result = await awardMinigameXp(req.user.id, {
    correct,
    total,
    gameType,
  });

  res.json(result);
}
