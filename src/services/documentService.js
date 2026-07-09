import prisma from '#db/prisma.js';

export function getDocumentProcessingState(processingStatus) {
  return {
    status: processingStatus,
  };
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
  const processingState = getDocumentProcessingState(d.processingStatus);

  return {
    id: d.id,
    user_id: d.userId,
    filename: d.filename,
    min_cefr: d.minCefr ?? null,
    s3_key: d.s3Key ?? null,
    created_at: d.createdAt.toISOString(),
    processing_status: processingState.status,
    processing_error: d.processingError ?? null,
    processed_at:
      processingState.status === 'ready'
        ? (d.processedAt?.toISOString() ?? d.createdAt.toISOString())
        : null,
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
