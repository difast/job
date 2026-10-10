// Применение данных, полученных от партнёра: резюме (с анализом) и вакансия (с анализом соответствия).
import { db } from '../db';
import { analyzeResume, analyzeVacancy } from '../ai';
import { getProfessionContext } from '../profession';
import { isLevel, type LevelKey } from '../types';
import { PARTNER } from './config';
import { matchProfession } from './profession-match';

export interface ImportPayload {
  externalUserId: string;
  email: string;
  emailVerified: boolean; // подтвердил ли JobToo владение почтой
  name: string;
  targetPosition: string;
  level: LevelKey | null;
  resume: { fileName: string; text: string } | null;
  vacancy: { title: string | null; company: string | null; description: string; url: string | null } | null;
}

export const parseImport = (s: string) => JSON.parse(s) as ImportPayload;

/** Если у пользователя ещё нет цели — берём её из данных партнёра (когда профессию удалось сопоставить). */
async function ensureGoal(userId: string, p: ImportPayload) {
  const u = await db.user.findUnique({ where: { id: userId } });
  if (!u) return null;
  if (u.professionId && isLevel(u.level)) return u;
  const professionId = u.professionId ?? (await matchProfession(p.targetPosition));
  const level = isLevel(u.level) ? u.level : p.level;
  if (!professionId && !level) return u;
  return db.user.update({ where: { id: userId }, data: { professionId: professionId ?? undefined, level: level ?? undefined } });
}

/**
 * Применяет импорт. Возвращает адрес, куда вести пользователя.
 * Если цели (профессия + уровень) нет — импорт остаётся отложенным до онбординга.
 * Захват импорта — через удаление строки, поэтому два параллельных вызова не создадут дублей.
 */
export async function applyImport(importId: string, userId: string): Promise<{ landing: string; applied: boolean }> {
  const row = await db.partnerImport.findUnique({ where: { id: importId } });
  if (!row) return { landing: '/dashboard', applied: false };
  if (row.userId !== userId) await db.partnerImport.update({ where: { id: importId }, data: { userId } });
  const p = parseImport(row.payload);
  const user = await ensureGoal(userId, p);
  if (!user?.professionId || !isLevel(user.level)) return { landing: '/onboarding', applied: false };
  const ctx = await getProfessionContext(user.professionId, user.level);
  if (!ctx) return { landing: '/onboarding', applied: false };

  const claimed = await db.partnerImport.deleteMany({ where: { id: importId } });
  if (!claimed.count) return { landing: '/dashboard', applied: false };
  try {
    let resumeId: string | null = null, resumeText: string | null = null, vacancyId: string | null = null;
    if (p.resume) {
      const analysis = await analyzeResume(p.resume.text, ctx);
      const r = await db.resume.create({ data: { userId, fileName: p.resume.fileName, text: p.resume.text, analysis: JSON.stringify(analysis), professionId: ctx.id, level: ctx.level } });
      resumeId = r.id; resumeText = r.text;
    } else {
      const last = await db.resume.findFirst({ where: { userId }, orderBy: { createdAt: 'desc' } });
      resumeId = last?.id ?? null; resumeText = last?.text ?? null;
    }
    if (p.vacancy && resumeText && p.vacancy.description.trim().length >= 60) {
      const text = [p.vacancy.title, p.vacancy.company, p.vacancy.description].filter(Boolean).join('\n\n').slice(0, 20000);
      const a = await analyzeVacancy(text, resumeText, ctx);
      const v = await db.vacancy.create({ data: { userId, title: (p.vacancy.title || a.title).slice(0, 120), text, analysis: JSON.stringify(a), matchScore: a.matchScore, resumeId } });
      vacancyId = v.id;
    }
    const landing = vacancyId ? `/vacancies/${vacancyId}` : resumeId ? '/resume' : '/dashboard';
    // Отмечаем результат в журнале передачи — по нему вход по ссылке узнаёт, куда вести пользователя
    const h = await db.partnerHandoff.findUnique({ where: { id: row.handoffId } });
    if (h) await db.partnerHandoff.update({ where: { id: h.id }, data: { result: JSON.stringify({ ...JSON.parse(h.result ?? '{}'), landing }) } });
    return { landing, applied: true };
  } catch (e) {
    // не теряем данные: возвращаем импорт в очередь
    await db.partnerImport.create({ data: { id: row.id, partner: row.partner, handoffId: row.handoffId, userId, payload: row.payload } }).catch(() => {});
    throw e;
  }
}

/** Применяет все отложенные импорты пользователя (вызывается после выбора цели в онбординге). */
export async function applyPendingImports(userId: string) {
  const rows = await db.partnerImport.findMany({ where: { userId, partner: PARTNER }, orderBy: { createdAt: 'asc' } });
  let landing: string | null = null;
  for (const r of rows) {
    try { const res = await applyImport(r.id, userId); if (res.applied) landing = res.landing; } catch (e) { console.warn('[integration] import apply failed', e); }
  }
  return landing;
}

/** Удаляет неприменённые импорты без владельца старше суток (привязка не завершена) и любые старше 30 дней. */
export async function cleanupImports() {
  const day = new Date(Date.now() - 86_400_000), month = new Date(Date.now() - 30 * 86_400_000);
  await db.partnerImport.deleteMany({ where: { OR: [{ userId: null, createdAt: { lt: day } }, { createdAt: { lt: month } }] } });
  await db.partnerLoginCode.deleteMany({ where: { expiresAt: { lt: day } } });
}
