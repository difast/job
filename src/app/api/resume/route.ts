import { db } from '@/lib/db';
import { requireApiUser } from '@/lib/auth';
import { ApiError, handler, json } from '@/lib/http';
import { extractResumeText, MAX_FILE_BYTES } from '@/lib/extract';
import { analyzeResume } from '@/lib/ai';
import { requireProfession, requireResume } from '@/lib/context';

export const maxDuration = 60;

// Загрузка резюме: извлечение текста → анализ с учётом профессии и уровня
export const POST = handler(async (req: Request) => {
  const user = await requireApiUser();
  const p = await requireProfession(user);
  const form = await req.formData().catch(() => null);
  const file = form?.get('file');
  if (!(file instanceof File) || !file.size) throw new ApiError(400, 'Выберите файл PDF или DOCX');
  if (file.size > MAX_FILE_BYTES) throw new ApiError(413, 'Файл больше 5 МБ');
  const text = await extractResumeText(file.name, Buffer.from(await file.arrayBuffer()));
  const analysis = await analyzeResume(text, p);
  const resume = await db.resume.create({
    data: { userId: user.id, fileName: file.name, text, analysis: JSON.stringify(analysis), professionId: p.id, level: p.level },
  });
  return json({ id: resume.id, analysis });
});

// Пересчёт анализа под текущую профессию/уровень
export const PUT = handler(async () => {
  const user = await requireApiUser();
  const p = await requireProfession(user);
  const resume = await requireResume(user.id);
  const analysis = await analyzeResume(resume.text, p);
  await db.resume.update({ where: { id: resume.id }, data: { analysis: JSON.stringify(analysis), professionId: p.id, level: p.level, analyzedAt: new Date() } });
  return json({ id: resume.id, analysis });
});

export const DELETE = handler(async () => {
  const user = await requireApiUser();
  await db.resume.deleteMany({ where: { userId: user.id } });
  return json({ ok: true });
});
