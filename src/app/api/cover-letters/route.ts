import { z } from 'zod';
import { db } from '@/lib/db';
import { requireApiUser } from '@/lib/auth';
import { ApiError, handler, json } from '@/lib/http';
import { extractCompany, generateLetter } from '@/lib/ai';
import { requireProfession, requireResume } from '@/lib/context';
import { applyChanges } from '@/lib/changes';
import { parseJson, type Change } from '@/lib/types';

export const maxDuration = 60;
const schema = z.object({ vacancyId: z.string(), style: z.enum(['professional', 'short', 'personal']) });

export const POST = handler(async (req: Request) => {
  const user = await requireApiUser();
  const { vacancyId, style } = schema.parse(await req.json().catch(() => ({})));
  const vacancy = await db.vacancy.findFirst({ where: { id: vacancyId, userId: user.id }, include: { adaptation: true } });
  if (!vacancy) throw new ApiError(404, 'Вакансия не найдена');
  const p = await requireProfession(user);
  const resume = await requireResume(user.id);
  const variant = await db.coverLetter.count({ where: { vacancyId } });
  // Если резюме адаптировано — берём принятую версию
  const resumeText = vacancy.adaptation ? applyChanges(resume.text, parseJson<Change[]>(vacancy.adaptation.changes, [])) : resume.text;
  const { text, engine } = await generateLetter(style, {
    userName: user.name, vacancyTitle: vacancy.title, company: extractCompany(vacancy.text), p, resumeText, vacancyText: vacancy.text, variant,
  });
  const letter = await db.coverLetter.create({ data: { vacancyId, style, text, engine } });
  return json({ id: letter.id, text, style, engine });
});
