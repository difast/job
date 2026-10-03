import { ApiError } from './http';

export const MAX_FILE_BYTES = 5 * 1024 * 1024;

function clean(t: string): string {
  return t.replace(/\r/g, '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

/** Извлекает текст из PDF / DOCX / TXT. */
export async function extractResumeText(fileName: string, buf: Buffer): Promise<string> {
  if (buf.length > MAX_FILE_BYTES) throw new ApiError(413, 'Файл больше 5 МБ');
  const ext = fileName.toLowerCase().split('.').pop();
  let text = '';
  try {
    if (ext === 'pdf') {
      const { PDFParse } = await import('pdf-parse');
      const parser = new PDFParse({ data: new Uint8Array(buf) });
      try { text = (await parser.getText()).text; } finally { await parser.destroy(); }
    } else if (ext === 'docx') {
      const mammoth = await import('mammoth');
      text = (await mammoth.extractRawText({ buffer: buf })).value;
    } else if (ext === 'txt') {
      text = buf.toString('utf8');
    } else {
      throw new ApiError(400, 'Поддерживаются файлы PDF и DOCX');
    }
  } catch (e) {
    if (e instanceof ApiError) throw e;
    throw new ApiError(422, 'Не удалось прочитать файл. Убедитесь, что это корректный PDF/DOCX с текстом (не скан).');
  }
  text = clean(text);
  if (text.length < 80) throw new ApiError(422, 'В файле слишком мало текста. Если это скан-изображение, загрузите версию с текстовым слоем.');
  return text.slice(0, 40000);
}
