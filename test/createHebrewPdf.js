import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fontkit from '@pdf-lib/fontkit';
import { PDFDocument } from 'pdf-lib';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const HEBREW_WORDS = [
  'שלום',
  'ספר',
  'מים',
  'אור',
  'יום',
  'לילה',
  'אהבה',
  'חלום',
  'ילד',
  'בת',
  'אמא',
  'אבא',
  'בית',
  'עיר',
  'יער',
  'שמש',
  'ירח',
  'כוכב',
  'פרח',
  'שיר',
  'חבר',
  'משפחה',
  'לימוד',
  'ידע',
  'חכמה',
  'שמחה',
  'תקווה',
  'אמת',
  'שלווה',
  'חיים',
];

export async function createHebrewPdf() {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  let page = doc.addPage([612, 792]);
  const pageWidth = page.getWidth();

  const fontPath = path.join(process.env.WINDIR || 'C:\\Windows', 'Fonts', 'arial.ttf');
  const fontBytes = fs.readFileSync(fontPath);
  const font = await doc.embedFont(fontBytes);

  const title = 'מילים בעברית';
  const titleSize = 22;
  const titleWidth = font.widthOfTextAtSize(title, titleSize);
  page.drawText(title, {
    x: (pageWidth - titleWidth) / 2,
    y: 740,
    size: titleSize,
    font,
  });

  const fontSize = 16;
  const lineHeight = 28;
  let y = 690;

  for (const word of HEBREW_WORDS) {
    const wordWidth = font.widthOfTextAtSize(word, fontSize);
    page.drawText(word, {
      x: pageWidth - 60 - wordWidth,
      y,
      size: fontSize,
      font,
    });
    y -= lineHeight;

    if (y < 60) {
      const newPage = doc.addPage([612, 792]);
      page = newPage;
      y = 740;
    }
  }

  const pdfBytes = await doc.save();
  const outPath = path.join(__dirname, '..', 'hebrew-words.pdf');
  fs.writeFileSync(outPath, pdfBytes);
  return outPath;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  createHebrewPdf().then((p) => console.log('Wrote', p));
}
