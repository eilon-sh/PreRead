import { fileTypeFromBuffer } from 'file-type';
import prisma from '#db/prisma.js';
import { uploadPdfToS3 } from '#services/s3Service.js';
import {
  buildDocumentS3Key,
  decodeUploadedFilename,
  sanitizeDisplayFilename,
} from '#utils/filenameUtils.js';

// מקצר הודעת שגיאת עיבוד
function formatProcessingError(err) {
  const message = err?.message ?? String(err);
  return message.replace(/\s+/g, ' ').trim().slice(0, 1000);
}

// מסמן מסמך כנכשל בעיבוד
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

const KNOWN_PROCESSING_ERRORS = new Set(['UNPROCESSABLE_FILE']);

// ממפה מסמך לפורמט תגובה
function mapDocument(d, wordCount) {
  return {
    id: d.id,
    filename: decodeUploadedFilename(d.filename),
    min_cefr: d.minCefr ?? null,
    processing_status: d.processingStatus,
    ...(KNOWN_PROCESSING_ERRORS.has(d.processingError)
      ? { processing_error: d.processingError }
      : {}),
    ...(wordCount !== undefined ? { word_count: wordCount } : {}),
  };
}

// מחזיר רשימת מסמכי המשתמש
export async function listDocuments(userId) {
  const documents = await prisma.document.findMany({
    where: { userId },
    include: { _count: { select: { words: true } } },
    orderBy: { createdAt: 'desc' },
  });

  return documents.map((d) => mapDocument(d, d._count.words));
}

// מחזיר מסמך בודד לפי מזהה
export async function getDocument(userId, id) {
  const doc = await prisma.document.findFirst({
    where: { id, userId },
    include: { _count: { select: { words: true } } },
  });
  if (!doc) return null;
  return mapDocument(doc, doc._count.words);
}

// יוצר רשומת מסמך במסד
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

// מעלה PDF ומפעיל עיבוד
export async function uploadDocument(userId, { buffer, originalname, minCefr }) {
  const detectedType = await fileTypeFromBuffer(buffer);
  if (detectedType?.mime !== 'application/pdf') {
    throw Object.assign(new Error('Uploaded file is not a valid PDF'), { status: 400 });
  }

  const filename = sanitizeDisplayFilename(originalname);
  const s3Key = buildDocumentS3Key(userId, decodeUploadedFilename(originalname));

  await uploadPdfToS3({ key: s3Key, buffer });

  const result = await createDocumentRecord(userId, {
    filename,
    minCefr,
    s3Key,
  });

  return {
    ...result,
    message: 'Document uploaded to S3 and processing started.',
  };
}

// מוחק מסמך אם אינו בעיבוד
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
