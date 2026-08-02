import {
  deleteDocument,
  getDocument,
  listDocuments,
  uploadDocument,
} from '#services/documentService.js';
import { parseMinCefr } from '#utils/cefrUtils.js';
import { parseIntSafe } from '#utils/parseIntUtils.js';

// מחזיר את כל מסמכי המשתמש
export async function list(req, res) {
  res.json(await listDocuments(req.user.id));
}

// מחזיר מסמך בודד לפי מזהה
export async function getById(req, res) {
  const id = parseIntSafe(req.params.id);
  if (id === null) return res.status(400).json({ error: 'Invalid document id' });

  const doc = await getDocument(req.user.id, id);
  if (!doc) return res.status(404).json({ error: 'Document not found' });
  res.json(doc);
}

// מעלה PDF ומפעיל עיבוד
export async function upload(req, res) {
  const file = req.file;
  if (!file) {
    return res.status(400).json({ error: 'PDF file is required' });
  }

  const minCefr = parseMinCefr(req.body.minCefr);
  if (minCefr === false) {
    return res.status(400).json({ error: 'minCefr must be one of B1, B2, C1, C2' });
  }

  const result = await uploadDocument(req.user.id, {
    buffer: file.buffer,
    originalname: file.originalname,
    minCefr,
  });

  res.status(202).json(result);
}

// מוחק מסמך אם אינו בעיבוד
export async function remove(req, res) {
  const id = parseIntSafe(req.params.id);
  if (id === null) return res.status(400).json({ error: 'Invalid document id' });

  const result = await deleteDocument(req.user.id, id);
  if (result.notFound) return res.status(404).json({ error: 'Document not found' });
  if (result.conflict) {
    return res.status(409).json({ error: 'Cannot delete a document while processing is active' });
  }
  res.json({ deleted: true });
}
