import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PDFDocument, StandardFonts } from 'pdf-lib';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function createSamplePdf() {
  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 792]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const lines = [
    'The ubiquitous nature of technology is significant in modern education.',
    'Students must comprehend meticulous research methods to achieve their goals.',
    'This ephemeral moment in learning can help build vocabulary skills.',
  ];

  let y = 720;
  for (const line of lines) {
    page.drawText(line, { x: 50, y, size: 14, font });
    y -= 28;
  }

  const pdfBytes = await doc.save();
  const outPath = path.join(__dirname, 'sample.pdf');
  fs.writeFileSync(outPath, pdfBytes);
  return outPath;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  createSamplePdf().then((p) => console.log('Wrote', p));
}
