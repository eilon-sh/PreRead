import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PDFDocument, StandardFonts } from 'pdf-lib';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const FILLER_LINE =
  'Academic research requires careful reading and sustained attention to detail across many pages of material.';

const TAIL_LINES = [
  'The ubiquitous nature of technology is significant in modern education.',
  'Students must comprehend meticulous research methods to achieve their goals.',
  'This ephemeral moment in learning can help build vocabulary skills.',
];

function wrapLine(text, maxChars = 90) {
  const words = text.split(' ');
  const lines = [];
  let current = '';

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length > maxChars && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }

  if (current) lines.push(current);
  return lines;
}

export async function createLongSamplePdf() {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontSize = 11;
  const lineHeight = 14;
  const marginX = 50;
  const marginTop = 720;
  const marginBottom = 60;
  const fillerLines = wrapLine(FILLER_LINE);
  const totalLines = 320;

  let page = doc.addPage([612, 792]);
  let y = marginTop;

  const addLine = (line) => {
    if (y < marginBottom) {
      page = doc.addPage([612, 792]);
      y = marginTop;
    }
    page.drawText(line, { x: marginX, y, size: fontSize, font });
    y -= lineHeight;
  };

  for (let i = 0; i < totalLines - TAIL_LINES.length; i++) {
    addLine(fillerLines[i % fillerLines.length]);
  }

  addLine('');
  for (const tailLine of TAIL_LINES) {
    for (const line of wrapLine(tailLine)) {
      addLine(line);
    }
  }

  const pdfBytes = await doc.save();
  const outPath = path.join(__dirname, 'sample-long.pdf');
  fs.writeFileSync(outPath, pdfBytes);
  return outPath;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  createLongSamplePdf().then((p) => console.log('Wrote', p));
}
