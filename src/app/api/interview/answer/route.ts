import { z } from 'zod';
import { db } from '@/lib/db';
import { requireApiUser } from '@/lib/auth';
import { ApiError, handler, json } from '@/lib/http';
import { evaluateAnswer } from '@/lib/ai';
import { requireProfession } from '@/lib/context';
import { parseJson } from '@/lib/types';

export const maxDuration = 60;
const schema = z.object({ questionId: z.string(), answer: z.string().trim().min(3, 'Напишите ответ').max(5000) });

export const POST = handler(async (req: Request) => {
  const user = await requireApiUser();
  const { questionId, answer } = schema.parse(await req.json().catch(() => ({})));
  const q = await db.interviewQuestion.findUnique({ where: { id: questionId } });
  if (!q) throw new ApiError(404, 'Вопрос не найден');
  const p = await requireProfession(user);
  const feedback = await evaluateAnswer({ text: q.text, category: q.category, keyPoints: parseJson<string[]>(q.keyPoints, []), sampleAnswer: q.sampleAnswer }, answer, p);
  await db.practiceAttempt.create({ data: { userId: user.id, questionId, answer, score: feedback.score, feedback: JSON.stringify(feedback) } });
  return json({ feedback });
});
