import { enqueuePdfConversion } from './pdfQueue.js';

export async function pdfToMarkdown(filePath) {
  const result = await enqueuePdfConversion(filePath);

  return {
    markdown: result.markdown,
    textLength: result.textLength,
  };
}
