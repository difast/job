import { createHash } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { categories, LEVELS } from './data/professions';
import { questions } from './data/questions';

const prisma = new PrismaClient();

async function main() {
  let order = 0;
  for (const [ci, cat] of categories.entries()) {
    await prisma.professionCategory.upsert({
      where: { id: cat.id }, update: { name: cat.name, sortOrder: ci }, create: { id: cat.id, name: cat.name, sortOrder: ci },
    });
    for (const p of cat.professions) {
      const data = {
        name: p.name, nameEn: p.nameEn ?? null, categoryId: cat.id, description: p.description,
        skills: JSON.stringify(p.skills), requirements: JSON.stringify(p.requirements), sortOrder: order++,
      };
      await prisma.profession.upsert({ where: { id: p.id }, update: data, create: { id: p.id, ...data } });
      for (const lv of LEVELS) {
        const ld = {
          summary: `${lv.label.split(' ')[0]}: ${p.levels[lv.id]}.`,
          expectations: JSON.stringify([...lv.expectations]),
          yearsFrom: lv.yearsFrom, yearsTo: lv.yearsTo,
        };
        await prisma.professionLevelProfile.upsert({
          where: { professionId_level: { professionId: p.id, level: lv.id } }, update: ld,
          create: { professionId: p.id, level: lv.id, ...ld },
        });
      }
    }
  }

  // Вопросы идемпотентны: стабильный id от (профессия, уровень, тип, текст) — попытки пользователей сохраняются
  const ids: string[] = [];
  for (const [i, q] of questions.entries()) {
    const id = 'q_' + createHash('sha1').update([q.professionId, q.level, q.type, q.text].join('|')).digest('hex').slice(0, 16);
    ids.push(id);
    const data = {
      professionId: q.professionId, level: q.level, type: q.type, text: q.text, category: q.category,
      difficulty: q.difficulty, sampleAnswer: q.sampleAnswer, keyPoints: JSON.stringify(q.keyPoints), sortOrder: i,
    };
    await prisma.interviewQuestion.upsert({ where: { id }, update: data, create: { id, ...data } });
  }
  await prisma.interviewQuestion.deleteMany({ where: { id: { notIn: ids } } });
  console.log(`Seeded: ${await prisma.profession.count()} professions, ${await prisma.interviewQuestion.count()} questions`);
}

main().finally(() => prisma.$disconnect());
