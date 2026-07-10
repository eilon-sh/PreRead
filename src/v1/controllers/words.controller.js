import { listWords } from '#services/wordService.js';
import { parseOptionalPositiveInt } from '#utils/parseIntUtils.js';

export async function list(req, res) {
  const documentId = parseOptionalPositiveInt(req.query.documentId);
  if (documentId === false) {
    return res.status(400).json({ error: 'Invalid documentId' });
  }

  const result = await listWords(req.user.id, { documentId });
  res.json(result);
}
