import {
  deleteDocument,
  getDocument,
  listDocuments,
  uploadDocument,
} from '#services/documentService.js';
import { parseIntSafe } from '#utils/parseIntUtils.js';

export async function list(req, res) {
  res.json(await listDocuments(req.user.id));
}

export async function getById(req, res) {
  const id = parseIntSafe(req.params.id);
  if (id === null) return res.status(400).json({ error: 'Invalid document id' });

  const doc = await getDocument(req.user.id, id);
  if (!doc) return res.status(404).json({ error: 'Document not found' });
  res.json(doc);
}

export async function upload(req, res) {
  const file = req.file;
  if (!file) {
    return res.status(400).json({ error: 'PDF file is required' });
  }

  const minCefr = req.body.minCefr ? String(req.body.minCefr).toUpperCase() : null;
  const result = await uploadDocument(req.user.id, {
    buffer: file.buffer,
    originalname: file.originalname,
    minCefr,
  });

  res.status(202).json(result);
}

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
