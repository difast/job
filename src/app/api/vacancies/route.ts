import { z } from 'zod';
import { db } from '@/lib/db';
import { requireApiUser } from '@/lib/auth';
import { handler, json } from '@/lib/http';
import { trackFirstAction } from '@/lib/partners/events';
import { analyzeVacancy } from '@/lib/ai';
import { requireProfession, requireResume } from '@/lib/context';
import { aiRateLimit } from '@/lib/ai/limits';

export const maxDuration = 60;
const schema = z.object({ text: z.string().trim().min(60, 'Вставьте полное описание вакансии (минимум 60 символов)').max(20000) });

export const POST = handler(async (req: Request) => {
  const user = await requireApiUser();
  const { text } = schema.parse(await req.json().catch(() => ({})));
  const p = await requireProfession(user);
  const resume = await requireResume(user.id);
  // Повторная отправка той же вакансии к тому же резюме возвращает уже созданный разбор
  const same = await db.vacancy.findFirst({ where: { userId: user.id, text, resumeId: resume.id, createdAt: { gte: new Date(Date.now() - 10 * 60_000) } }, orderBy: { createdAt: 'desc' } });
  if (same) return json({ id: same.id, duplicate: true });
  aiRateLimit(user.id);
  const analysis = await analyzeVacancy(text, resume.text, p);
  const v = await db.vacancy.create({
    data: { userId: user.id, title: analysis.title.slice(0, 120), text, analysis: JSON.stringify(analysis), matchScore: analysis.matchScore, resumeId: resume.id },
  });
  void trackFirstAction(user.id);
  return json({ id: v.id });
});
