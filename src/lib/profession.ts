import { db } from './db';
import { parseJson, type LevelKey, type ProfessionContext } from './types';

export async function getProfessionContext(professionId: string, level: LevelKey): Promise<ProfessionContext | null> {
  const p = await db.profession.findUnique({ where: { id: professionId }, include: { levelProfiles: { where: { level } } } });
  if (!p) return null;
  const lp = p.levelProfiles[0];
  return {
    id: p.id, name: p.name, nameEn: p.nameEn, description: p.description,
    skills: parseJson<string[]>(p.skills, []), requirements: parseJson<string[]>(p.requirements, []),
    level, levelSummary: lp?.summary ?? '', levelExpectations: parseJson<string[]>(lp?.expectations ?? '[]', []),
    yearsFrom: lp?.yearsFrom ?? 0, yearsTo: lp?.yearsTo ?? null,
  };
}
