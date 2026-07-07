import { getWord, listWords } from '#services/wordService.js';
import { parseIntOr, parseIntSafe } from '#utils/parseIntUtils.js';

export async function list(req, res) {
  const { documentId } = req.query;
  const result = await listWords(req.user.id, {
    documentId: documentId ? parseIntOr(documentId, undefined) : undefined,
  });
  res.json(result);
}

export async function getById(req, res) {
  const id = parseIntSafe(req.params.id);
  if (id === null) return res.status(400).json({ error: 'Invalid word id' });

  const word = await getWord(req.user.id, id);
  if (!word) return res.status(404).json({ error: 'Word not found' });
  res.json(word);
}
