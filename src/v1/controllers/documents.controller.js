import { fileTypeFromBuffer } from 'file-type';
import config from '#config.js';
import prisma from '#db/prisma.js';
import {
  createDocumentRecord,
  deleteDocument,
  getDocument,
  listDocuments,
} from '#services/documentService.js';
import { buildDocumentS3Key, uploadPdfToS3 } from '#services/s3Service.js';
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

  try {
    const detectedType = await fileTypeFromBuffer(file.buffer);
    if (detectedType?.mime !== 'application/pdf') {
      return res.status(400).json({ error: 'Uploaded file is not a valid PDF' });
    }

    const minCefr = req.body.minCefr ? String(req.body.minCefr).toUpperCase() : null;
    const s3Key = buildDocumentS3Key(req.user.id, file.originalname);

    const result = await createDocumentRecord(req.user.id, {
      filename: file.originalname,
      minCefr,
      s3Key,
    });

    try {
      await uploadPdfToS3({ key: s3Key, buffer: file.buffer });
    } catch (uploadErr) {
      await prisma.document.update({
        where: { id: result.id },
        data: { processingStatus: 'failed' },
      });
      throw uploadErr;
    }

    res.status(202).json({
      ...result,
      message: 'Document uploaded to S3 and processing started.',
    });
  } catch (err) {
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
