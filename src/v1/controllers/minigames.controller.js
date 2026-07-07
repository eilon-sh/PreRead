import { awardMinigameXp, getGameWords } from '#services/minigameService.js';
import { parseIntOr } from '#utils/parseIntUtils.js';

export async function getWords(req, res) {
  const { cefr, documentId, limit } = req.query;
  const words = await getGameWords(req.user.id, {
    cefr: cefr || null,
    documentId: documentId ? parseIntOr(documentId, undefined) : undefined,
    limit: parseIntOr(limit, 20),
  });

  res.json({ words, total: words.length });
}

export async function complete(req, res) {
  const { correct, total, gameType } = req.body;
  if (typeof correct !== 'number' || typeof total !== 'number' || !gameType) {
    return res.status(400).json({ error: 'נתונים לא תקינים' });
  }

  const result = await awardMinigameXp(req.user.id, {
    correct: Math.max(0, Math.min(correct, total)),
    total,
    gameType,
  });

  res.json(result);
}
