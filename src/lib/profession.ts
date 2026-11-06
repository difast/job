import { db } from './db';
import { parseJson, type LevelKey, type ProfessionContext } from './types';

/** «Другая профессия»: название вписывает пользователь (User.professionTitle). */
export const CUSTOM_PROFESSION_ID = 'custom';

/** Название профессии для интерфейса: своё название пользователя или из справочника. */
export const professionName = (u: { professionId: string | null; professionTitle?: string | null; profession?: { name: string } | null }) =>
  (u.professionId === CUSTOM_PROFESSION_ID && u.professionTitle) || u.profession?.name || '';

export async function getProfessionContext(professionId: string, level: LevelKey, title?: string | null): Promise<ProfessionContext | null> {
  const p = await db.profession.findUnique({ where: { id: professionId }, include: { levelProfiles: { where: { level } } } });
  if (!p) return null;
  const lp = p.levelProfiles[0];
  const custom = p.id === CUSTOM_PROFESSION_ID;
  return {
    id: p.id, name: custom && title ? title : p.name, nameEn: p.nameEn, description: custom && title ? `Профессия «${title}» указана пользователем, её нет в справочнике Clymly. Типичные навыки и требования определяй по названию профессии, тексту резюме и вакансии.` : p.description, custom,
    skills: parseJson<string[]>(p.skills, []), requirements: parseJson<string[]>(p.requirements, []),
    level, levelSummary: lp?.summary ?? '', levelExpectations: parseJson<string[]>(lp?.expectations ?? '[]', []),
    yearsFrom: lp?.yearsFrom ?? 0, yearsTo: lp?.yearsTo ?? null,
  };
}
