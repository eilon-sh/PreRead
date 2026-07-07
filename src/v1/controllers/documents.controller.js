import fs from 'node:fs';
import {
  createDocument,
  deleteDocument,
  getDocument,
  listDocuments,
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
  try {
    const result = await createDocument(req.user.id, req.file, req.body.minCefr);
    res.status(202).json(result);
  } catch (err) {
    if (req.file?.path && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    const status = err.status || 500;
    res.status(status).json({ error: err.message });
  }
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
