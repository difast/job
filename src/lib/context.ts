import { db } from './db';
import { ApiError } from './http';
import { getProfessionContext } from './profession';
import { isLevel, type ProfessionContext } from './types';

type U = { id: string; professionId: string | null; level: string | null };

export async function requireProfession(user: U): Promise<ProfessionContext> {
  if (!user.professionId || !isLevel(user.level)) throw new ApiError(400, 'Сначала выберите профессию и уровень');
  const p = await getProfessionContext(user.professionId, user.level);
  if (!p) throw new ApiError(400, 'Профессия не найдена');
  return p;
}

export async function latestResume(userId: string) {
  return db.resume.findFirst({ where: { userId }, orderBy: { createdAt: 'desc' } });
}

export async function requireResume(userId: string) {
  const r = await latestResume(userId);
  if (!r) throw new ApiError(400, 'Сначала загрузите резюме');
  return r;
}
