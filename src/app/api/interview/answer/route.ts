import { z } from 'zod';
import { db } from '@/lib/db';
import { requireApiUser } from '@/lib/auth';
import { ApiError, handler, json } from '@/lib/http';
import { trackFirstAction } from '@/lib/partners/events';
import { evaluateAnswer } from '@/lib/ai';
import { aiRateLimit } from '@/lib/ai/limits';
import { requireProfession } from '@/lib/context';
import { parseJson, type AnswerFeedback, type VacancyAnalysis } from '@/lib/types';

export const maxDuration = 60;
const schema = z.object({
  questionId: z.string().min(1).max(40),
  answer: z.string().trim().min(3, 'Напишите ответ').max(5000, 'Ответ слишком длинный — сократите до 5000 символов'),
  vacancyId: z.string().max(40).optional(),
});

export const POST = handler(async (req: Request) => {
  const user = await requireApiUser();
  const { questionId, answer, vacancyId } = schema.parse(await req.json().catch(() => ({})));
  const q = await db.interviewQuestion.findUnique({ where: { id: questionId }, include: { vacancy: { select: { userId: true } } } });
  // Вопрос под чужую вакансию недоступен — как будто его нет
  if (!q || (q.vacancyId && q.vacancy?.userId !== user.id)) throw new ApiError(404, 'Вопрос не найден');
  // Повторная отправка того же ответа (двойной клик, повтор после обрыва связи) возвращает уже готовый разбор
  const dup = await db.practiceAttempt.findFirst({ where: { userId: user.id, questionId, answer, createdAt: { gte: new Date(Date.now() - 2 * 60_000) } }, orderBy: { createdAt: 'desc' } });
  if (dup) return json({ feedback: parseJson<AnswerFeedback | null>(dup.feedback, null), duplicate: true });
  const p = await requireProfession(user);
  const vacancy = vacancyId ? await db.vacancy.findFirst({ where: { id: vacancyId, userId: user.id }, select: { analysis: true } }) : null;
  const focus = (parseJson<VacancyAnalysis | null>(vacancy?.analysis ?? '', null)?.requirements ?? []).filter((r) => r.status !== 'match').map((r) => r.text);
  const prev = await db.practiceAttempt.findFirst({ where: { userId: user.id, questionId }, orderBy: { createdAt: 'desc' }, select: { answer: true, score: true } });
  aiRateLimit(user.id);
  const feedback = await evaluateAnswer({ text: q.text, category: q.category, keyPoints: parseJson<string[]>(q.keyPoints, []), sampleAnswer: q.sampleAnswer }, answer, p, { vacancyFocus: focus, previous: prev });
  await db.practiceAttempt.create({ data: { userId: user.id, questionId, answer, score: feedback.score, feedback: JSON.stringify(feedback) } });
  void trackFirstAction(user.id);
  return json({ feedback });
});
