import { z } from 'zod';
import type {
  AnswerFeedback, Change, LetterStyle, ProfessionContext, ResumeAnalysis, VacancyAnalysis,
} from '../types';
import { LEVEL_LABELS, STYLE_LABELS } from '../types';
import { introducesNewFacts } from './guard';
import {
  adaptResumeHeuristic, analyzeResumeHeuristic, analyzeVacancyHeuristic, extractCompany, feedbackHeuristic, letterHeuristic,
  type LetterInput,
} from './heuristic';
import { callJson, callText, llmEnabled } from './llm';

const cut = (s: string, n = 14000) => (s.length > n ? s.slice(0, n) : s);
const score = z.number().min(0).max(100).transform(Math.round);

const profBlock = (p: ProfessionContext) =>
  `Целевая профессия: ${p.name}. Уровень: ${LEVEL_LABELS[p.level]}.\nОписание: ${p.description}\nТипичные навыки: ${p.skills.join(', ')}\nТипичные требования: ${p.requirements.join('; ')}\nОжидания уровня: ${p.levelSummary} ${p.levelExpectations.join('; ')}`;

async function withFallback<T>(label: string, llm: () => Promise<T>, fallback: () => T): Promise<T> {
  if (!llmEnabled()) return fallback();
  try { return await llm(); } catch (e) {
    console.warn(`[ai] ${label}: LLM failed, using heuristic engine —`, (e as Error).message);
    return fallback();
  }
}

// ───────── Анализ резюме ─────────
const resumeSchema = z.object({
  score, breakdown: z.object({ structure: score, experience: score, achievements: score, skills: score, fit: score, ats: score }),
  strengths: z.array(z.string()).min(1).max(6),
  improvements: z.array(z.object({ title: z.string(), detail: z.string() })).min(3).max(5),
  missingSkills: z.array(z.string()).max(10),
  experienceTips: z.array(z.string()).max(6),
});

export const analyzeResume = (text: string, p: ProfessionContext): Promise<ResumeAnalysis> =>
  withFallback('analyzeResume', async () => {
    const r = await callJson(
      'Ты карьерный консультант и эксперт по найму. Проанализируй резюме для целевой профессии и уровня. Оценки 0-100.',
      `${profBlock(p)}\n\nРЕЗЮМЕ:\n${cut(text)}\n\nВерни JSON: {"score":int,"breakdown":{"structure":int,"experience":int,"achievements":int,"skills":int,"fit":int,"ats":int},"strengths":[str],"improvements":[{"title":str,"detail":str}] (3-5 конкретных),"missingSkills":[str] (навыки профессии, которых нет в резюме; формулируй как «если владеете — добавьте»),"experienceTips":[str]}`,
      resumeSchema,
    );
    return { ...r, engine: 'llm' as const };
  }, () => analyzeResumeHeuristic(text, p));

// ───────── Анализ вакансии ─────────
const vacancySchema = z.object({
  title: z.string(), matchScore: score,
  requirements: z.array(z.object({ text: z.string(), status: z.enum(['match', 'partial', 'missing']), note: z.string().optional() })).min(1).max(15),
  present: z.array(z.string()), missing: z.array(z.string()), suggestions: z.array(z.string()),
});

export const analyzeVacancy = (vacancyText: string, resumeText: string, p: ProfessionContext): Promise<VacancyAnalysis> =>
  withFallback('analyzeVacancy', async () => {
    const r = await callJson(
      'Ты рекрутер. Сравни резюме с вакансией и оцени соответствие требований (match — подтверждено резюме, partial — частично/косвенно, missing — нет).',
      `${profBlock(p)}\n\nВАКАНСИЯ:\n${cut(vacancyText, 8000)}\n\nРЕЗЮМЕ:\n${cut(resumeText)}\n\nВерни JSON: {"title":str,"matchScore":int,"requirements":[{"text":str,"status":"match|partial|missing","note":str?}],"present":[str] (что есть в резюме),"missing":[str] (чего не хватает),"suggestions":[str] (что стоит изменить в резюме без выдумывания фактов)}`,
      vacancySchema,
    );
    return { ...r, engine: 'llm' as const };
  }, () => analyzeVacancyHeuristic(vacancyText, resumeText, p));

// ───────── Адаптация резюме ─────────
const adaptSchema = z.object({
  changes: z.array(z.object({
    lineIndex: z.number().int().min(0), adapted: z.string().min(1), reason: z.string(), section: z.string().optional(),
  })).max(15),
});

export async function adaptResume(
  resumeText: string, vacancyText: string, vacancy: VacancyAnalysis, p: ProfessionContext,
): Promise<{ changes: Change[]; engine: 'llm' | 'heuristic' }> {
  const heuristic = () => ({ changes: adaptResumeHeuristic(resumeText, vacancyText, vacancy, p), engine: 'heuristic' as const });
  return withFallback<{ changes: Change[]; engine: 'llm' | 'heuristic' }>('adaptResume', async () => {
    const ls = resumeText.replace(/\r/g, '').split('\n');
    const numbered = ls.map((l, i) => `${i}: ${l}`).join('\n');
    const r = await callJson(
      'Ты редактор резюме. Адаптируй формулировки строк резюме под вакансию и целевую профессию. Меняй только формулировки: сохраняй все факты, цифры, названия компаний и технологий ровно как в исходной строке. Не добавляй навыки из вакансии, если их нет в строке.',
      `${profBlock(p)}\n\nВАКАНСИЯ:\n${cut(vacancyText, 8000)}\n\nРЕЗЮМЕ ПО СТРОКАМ (номер: текст):\n${cut(numbered)}\n\nВерни JSON: {"changes":[{"lineIndex":int (номер строки для замены),"adapted":str (новая версия этой строки),"reason":str (почему),"section":str}]} — не более 12 правок, только действительно полезные.`,
      adaptSchema,
    );
    const changes: Change[] = [];
    for (const c of r.changes) {
      const original = ls[c.lineIndex];
      if (original === undefined || !original.trim() || c.adapted.trim() === original.trim()) continue;
      if (introducesNewFacts(original, c.adapted)) continue; // отбрасываем правки с выдуманными фактами
      changes.push({ id: `c${changes.length + 1}`, kind: 'replace', lineIndex: c.lineIndex, section: c.section || 'Опыт', original, adapted: c.adapted, reason: c.reason, status: 'pending' });
    }
    if (!changes.length) return heuristic();
    return { changes, engine: 'llm' };
  }, heuristic);
}

// ───────── Сопроводительное письмо ─────────
export async function generateLetter(style: LetterStyle, input: LetterInput): Promise<{ text: string; engine: 'llm' | 'heuristic' }> {
  return withFallback<{ text: string; engine: 'llm' | 'heuristic' }>('letter', async () => {
    const text = await callText(
      'Ты помогаешь написать сопроводительное письмо. Используй только факты из резюме. Не пиши плейсхолдеры в квадратных скобках. Без темы письма, только текст с приветствием и подписью.',
      `${profBlock(input.p)}\nСтиль: ${STYLE_LABELS[style]} (${style === 'short' ? '3-4 предложения' : style === 'personal' ? 'тёплый, живой тон, объясни личную мотивацию' : 'деловой, структурированный, 150-220 слов'}).\nИмя кандидата: ${input.userName}\nВариант №${input.variant} — формулируй свежо.\n\nВАКАНСИЯ:\n${cut(input.vacancyText, 8000)}\n\nРЕЗЮМЕ:\n${cut(input.resumeText)}`,
    );
    if (/\[[^\]]{2,}\]/.test(text)) throw new Error('placeholders in letter');
    return { text, engine: 'llm' };
  }, () => ({ text: letterHeuristic(style, input), engine: 'heuristic' as const }));
}

// ───────── Оценка ответа ─────────
const feedbackSchema = z.object({ score, covered: z.array(z.string()), missed: z.array(z.string()), tips: z.array(z.string()).min(1).max(5) });

export const evaluateAnswer = (
  question: { text: string; category: string; keyPoints: string[]; sampleAnswer: string }, answer: string, p: ProfessionContext,
): Promise<AnswerFeedback> =>
  withFallback('evaluateAnswer', async () => {
    const r = await callJson(
      'Ты интервьюер и коуч. Оцени ответ кандидата на вопрос собеседования, сопоставив с ключевыми пунктами сильного ответа. Будь конкретным и доброжелательным.',
      `${profBlock(p)}\n\nВОПРОС: ${question.text}\nКлючевые пункты сильного ответа: ${question.keyPoints.join('; ')}\n\nОТВЕТ КАНДИДАТА:\n${cut(answer, 4000)}\n\nВерни JSON: {"score":int 0-100,"covered":[str] (какие ключевые пункты раскрыты — дословно из списка),"missed":[str] (не раскрытые из списка),"tips":[str] (2-4 конкретных совета как улучшить ответ, без выдумывания фактов за кандидата)}`,
      feedbackSchema,
    );
    return { ...r, engine: 'llm' as const };
  }, () => feedbackHeuristic(answer, question.keyPoints, question.category));

export { extractCompany };
