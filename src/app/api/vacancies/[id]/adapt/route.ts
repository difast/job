import { db } from '@/lib/db';
import { requireApiUser } from '@/lib/auth';
import { ApiError, handler, json } from '@/lib/http';
import { adaptResume } from '@/lib/ai';
import { requireProfession, requireResume } from '@/lib/context';
import { parseJson, type VacancyAnalysis } from '@/lib/types';

export const maxDuration = 60;

// Создаёт (или пересоздаёт) адаптацию резюме под вакансию
export const POST = handler(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requireApiUser();
  const { id } = await params;
  const vacancy = await db.vacancy.findFirst({ where: { id, userId: user.id } });
  if (!vacancy) throw new ApiError(404, 'Вакансия не найдена');
  const p = await requireProfession(user);
  const resume = await requireResume(user.id);
  const analysis = parseJson<VacancyAnalysis>(vacancy.analysis, null as unknown as VacancyAnalysis);
  const { changes, engine } = await adaptResume(resume.text, vacancy.text, analysis, p);
  const data = { resumeId: resume.id, changes: JSON.stringify(changes), engine };
  const a = await db.adaptation.upsert({ where: { vacancyId: vacancy.id }, update: data, create: { vacancyId: vacancy.id, ...data } });
  return json({ id: a.id, changes: changes.length });
});
