import fs from 'node:fs';
import { fileTypeFromBuffer } from 'file-type';
import prisma from '#db/prisma.js';
import { today } from '#utils/dateUtils.js';
import { extractWords } from './bedrockService.js';
import { checkAchievements, getUserStats } from './gameService.js';
import { pdfToMarkdown } from './pdfService.js';

function wordKey(text) {
  return String(text || '')
    .trim()
    .toLowerCase();
}

export function getDocumentProcessingState(processingStatus) {
  return {
    status: processingStatus,
  };
}

export async function failStuckProcessingDocuments() {
  const result = await prisma.document.updateMany({
    where: { processingStatus: 'processing' },
    data: { processingStatus: 'failed' },
  });

  if (result.count > 0) {
    console.warn(
      `[startup] Marked ${result.count} stuck document(s) as failed after server restart`,
    );
  }

  return result.count;
}

function mapDocument(d, wordCount) {
  const processingState = getDocumentProcessingState(d.processingStatus);

  return {
    id: d.id,
    user_id: d.userId,
    filename: d.filename,
    created_at: d.createdAt.toISOString(),
    processing_status: processingState.status,
    processed_at:
      processingState.status === 'ready'
        ? (d.processedAt?.toISOString() ?? d.createdAt.toISOString())
        : null,
    ...(wordCount !== undefined ? { word_count: wordCount } : {}),
  };
}

async function saveExtractedWords(documentId, words) {
  const existingRows = await prisma.word.findMany({
    where: { documentId },
    select: { word: true },
  });
  const existingKeys = new Set(existingRows.map((row) => wordKey(row.word)));

  const seenInBatch = new Set();
  const toCreate = [];

  for (const w of words) {
    const key = wordKey(w.word);
    if (!key || seenInBatch.has(key) || existingKeys.has(key)) continue;

    seenInBatch.add(key);
    toCreate.push(w);
  }

  if (toCreate.length === 0) return;

  await prisma.$transaction(
    async (tx) => {
      const createdWords = await tx.word.createManyAndReturn({
        data: toCreate.map((w) => ({
          documentId,
          word: w.word,
          definition: w.definition,
          cefr: w.cefr,
          context: w.context,
          translation: w.translation,
        })),
      });

      await tx.flashcard.createMany({
        data: createdWords.map((word) => ({
          wordId: word.id,
          easeFactor: 2.5,
          interval: 0,
          repetitions: 0,
          nextReview: today(),
        })),
      });
    },
    { timeout: 30_000 },
  );
}

export async function processUploadedDocument({ filePath, documentId, userId, minCefr }) {
  try {
    const { markdown, textLength } = await pdfToMarkdown(filePath);

    if (textLength < 10) {
      console.error(`[document:${documentId}] Processing failed: Could not extract text from PDF`);
      await prisma.document.update({
        where: { id: documentId },
        data: {
          processingStatus: 'failed',
        },
      });
      return;
    }

    const words = await extractWords(markdown, minCefr);
    await saveExtractedWords(documentId, words);

    await prisma.document.update({
      where: { id: documentId },
      data: {
        processingStatus: 'ready',
        processedAt: new Date(),
      },
    });
    const stats = await getUserStats(userId);
    await checkAchievements(userId, stats);
  } catch (err) {
    console.error(`[document:${documentId}] Processing failed:`, err);
    await prisma.document.update({
      where: { id: documentId },
      data: {
        processingStatus: 'failed',
      },
    });
  } finally {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }
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

export async function createDocument(userId, file, minCefr) {
  if (!file) {
    throw Object.assign(new Error('PDF file is required'), { status: 400 });
  }

  const fileBuffer = await fs.promises.readFile(file.path);
  const detectedType = await fileTypeFromBuffer(fileBuffer);

  if (detectedType?.mime !== 'application/pdf') {
    fs.unlinkSync(file.path);
    throw Object.assign(new Error('Uploaded file is not a valid PDF'), {
      status: 400,
    });
  }

  const doc = await prisma.document.create({
    data: {
      userId,
      filename: file.originalname,
      processingStatus: 'processing',
    },
  });

  void processUploadedDocument({
    filePath: file.path,
    documentId: doc.id,
    userId,
    minCefr: minCefr || null,
  });

  return {
    id: doc.id,
    filename: doc.filename,
    processing_status: 'processing',
    message: 'Document upload accepted and processing started.',
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
