import path from 'node:path';
import { fileTypeFromBuffer } from 'file-type';
import prisma from '#db/prisma.js';
import { uploadPdfToS3 } from '#services/s3Service.js';
import { decodeUploadedFilename } from '#utils/filenameUtils.js';

function buildDocumentS3Key(userId, filename) {
  const base = path.basename(filename ?? 'document', '.pdf');
  const normalized = base.replace(/[^a-zA-Z0-9-_]/g, '_').slice(0, 80) || 'document';
  return `${userId}-${Date.now()}-${normalized}.pdf`;
}

function formatProcessingError(err) {
  const message = err?.message ?? String(err);
  return message.replace(/\s+/g, ' ').trim().slice(0, 1000);
}

export async function markDocumentFailed(documentId, err) {
  const processingError = typeof err === 'string' ? err.slice(0, 1000) : formatProcessingError(err);

  await prisma.document.update({
    where: { id: documentId },
    data: {
      processingStatus: 'failed',
      processingError,
    },
  });
}

export async function failStuckProcessingDocuments() {
  const result = await prisma.document.updateMany({
    where: { processingStatus: 'processing' },
    data: {
      processingStatus: 'failed',
      processingError:
        'Processing interrupted (server restarted while document was still processing).',
    },
  });

  if (result.count > 0) {
    console.warn(
      `[startup] Marked ${result.count} stuck document(s) as failed after server restart`,
    );
  }

  return result.count;
}

function mapDocument(d, wordCount) {
  return {
    id: d.id,
    filename: decodeUploadedFilename(d.filename),
    min_cefr: d.minCefr ?? null,
    processing_status: d.processingStatus,
    ...(wordCount !== undefined ? { word_count: wordCount } : {}),
  };
}

export async function listDocuments(userId) {
  const documents = await prisma.document.findMany({
    where: { userId },
    include: { _count: { select: { words: true } } },
    orderBy: { createdAt: 'desc' },
  });

  return documents.map((d) => mapDocument(d, d._count.words));
}

export async function getDocument(userId, id) {
  const doc = await prisma.document.findFirst({
    where: { id, userId },
    include: { _count: { select: { words: true } } },
  });
  if (!doc) return null;
  return mapDocument(doc, doc._count.words);
}

export async function createDocumentRecord(userId, uploadData) {
  const doc = await prisma.document.create({
    data: {
      userId,
      filename: uploadData.filename,
      processingStatus: 'processing',
      processingError: null,
      minCefr: uploadData.minCefr || null,
      s3Key: uploadData.s3Key,
    },
  });

  return {
    id: doc.id,
    filename: decodeUploadedFilename(doc.filename),
    processing_status: 'processing',
    message: 'Document upload accepted and processing started.',
  };
}

export async function uploadDocument(userId, { buffer, originalname, minCefr }) {
  const detectedType = await fileTypeFromBuffer(buffer);
  if (detectedType?.mime !== 'application/pdf') {
    throw Object.assign(new Error('Uploaded file is not a valid PDF'), { status: 400 });
  }

  const filename = decodeUploadedFilename(originalname);
  const s3Key = buildDocumentS3Key(userId, filename);
  const result = await createDocumentRecord(userId, {
    filename,
    minCefr,
    s3Key,
  });

  try {
    await uploadPdfToS3({ key: s3Key, buffer });
  } catch (uploadErr) {
    await markDocumentFailed(result.id, uploadErr);
    throw uploadErr;
  }

  return {
    ...result,
    message: 'Document uploaded to S3 and processing started.',
  };
}

export async function deleteDocument(userId, id) {
  const doc = await prisma.document.findFirst({
    where: { id, userId },
  });

  if (!doc) return { notFound: true };
  if (doc.processingStatus === 'processing') {
    return { conflict: true };
  }

  await prisma.document.delete({ where: { id: doc.id } });

  return { deleted: true };
}
