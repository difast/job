import PDFDocument from 'pdfkit';
import path from 'node:path';
import { BULLET_RE, detectSections } from './text';

const FONT = path.join(process.cwd(), 'assets', 'fonts', 'DejaVuSans.ttf');
const FONT_BOLD = path.join(process.cwd(), 'assets', 'fonts', 'DejaVuSans-Bold.ttf');

/** Рендерит текст резюме в аккуратный PDF (кириллица поддерживается через DejaVu Sans). */
export function resumeToPdf(text: string, title: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margins: { top: 56, bottom: 56, left: 60, right: 60 }, info: { Title: title } });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const ls = text.replace(/\r/g, '').split('\n');
    const heads = detectSections(ls);
    const headIdx = new Set(Object.values(heads));
    let first = true;
    ls.forEach((line, i) => {
      const t = line.trim();
      if (!t) { doc.moveDown(0.4); return; }
      if (first) {
        first = false;
        doc.font(FONT_BOLD).fontSize(18).fillColor('#111827').text(t).moveDown(0.3);
        return;
      }
      if (headIdx.has(i)) {
        doc.moveDown(0.5).font(FONT_BOLD).fontSize(11).fillColor('#4f46e5').text(t.toUpperCase(), { characterSpacing: 0.6 });
        const y = doc.y + 1;
        doc.moveTo(doc.page.margins.left, y).lineTo(doc.page.width - doc.page.margins.right, y).lineWidth(0.5).strokeColor('#d1d5db').stroke();
        doc.moveDown(0.4);
        return;
      }
      doc.font(FONT).fontSize(10).fillColor('#1f2937');
      if (BULLET_RE.test(line)) doc.text('•  ' + t.replace(BULLET_RE, ''), { indent: 8, lineGap: 2 });
      else doc.text(t, { lineGap: 2 });
    });
    doc.end();
  });
}
