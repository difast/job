// AI-функции Clymly. Все идут через единый модуль провайдера (llm.ts → provider.ts → GigaChat / Anthropic).
// Без провайдера (AI_PROVIDER=none или не заданы ключи) работает упрощённый режим на правилах (engine: 'heuristic').
// Если провайдер настроен, но не ответил или ответил некорректно, пользователь получает понятную ошибку —
// результат правил не выдаётся за ответ ИИ.
import { z } from 'zod';
import type { AnswerFeedback, Change, InterviewType, LetterStyle, ProfessionContext, ResumeAnalysis, VacancyAnalysis } from '../types';
import { ApiError } from '../http';
import { introducesNewFacts } from './guard';
import {
  adaptResumeHeuristic, analyzeResumeHeuristic, analyzeVacancyHeuristic, extractCompany, feedbackHeuristic, letterHeuristic,
  type LetterInput,
} from './heuristic';
import { callJson, callText, llmEnabled } from './llm';
import { adaptPrompt, evaluatePrompt, interviewQuestionsPrompt, letterPrompt, resumePrompt, vacancyPrompt } from './prompts';
import {
  evidenceFound, foreignLatin, foreignNumbers, looksLikeResume, looksLikeVacancy, matchKeyPoints, redactContacts, vacancyOnlyTerms,
} from './validate';

export { llmEnabled, extractCompany };

export const LIMITS = { resume: 14_000, vacancy: 8_000, answer: 4_000 };
const cut = (s: string, n: number) => (s.length > n ? s.slice(0, n) : s);
const score = z.number().min(0).max(100).transform(Math.round);
const str = z.string().trim().min(1);
const strList = (max: number) => z.array(z.string()).transform((a) => a.map((x) => x.trim()).filter(Boolean)).pipe(z.array(z.string()).max(max));

export const NOT_RESUME = 'Похоже, это не резюме. Загрузите файл со своим резюме: опытом работы, образованием и навыками.';
export const NOT_VACANCY = 'Похоже, это не описание вакансии. Вставьте текст вакансии целиком: обязанности, требования и условия.';

/* ───────── Анализ резюме ───────── */
const notResume = z.object({ isResume: z.literal(false), notResumeReason: z.string().optional() });
const resumeOk = z.object({
  isResume: z.literal(true).optional(),
  breakdown: z.object({ structure: score, experience: score, achievements: score, skills: score, fit: score, ats: score }),
  strengths: strList(6).pipe(z.array(z.string()).min(1)),
  improvements: z.array(z.object({ title: str, detail: str })).min(1).max(6),
  missingSkills: strList(10).default([]),
  experienceTips: strList(6).default([]),
  limitations: strList(3).default([]),
});
export const resumeSchema = z.union([notResume, resumeOk]);

export async function analyzeResume(text: string, p: ProfessionContext): Promise<ResumeAnalysis> {
  if (!text.trim()) throw new ApiError(422, 'Резюме пустое. Загрузите файл с текстом резюме.');
  if (looksLikeResume(text) === 'no') throw new ApiError(422, NOT_RESUME);
  if (!llmEnabled()) return analyzeResumeHeuristic(text, p);
  const truncated = text.length > LIMITS.resume;
  const r = await callJson('analyzeResume', resumePrompt(p, cut(redactContacts(text), LIMITS.resume), truncated), resumeSchema);
  if (r.isResume === false) throw new ApiError(422, NOT_RESUME);
  const b = r.breakdown;
  // Общая оценка — среднее по критериям, а не отдельное число модели
  const total = Math.round((b.structure + b.experience + b.achievements + b.skills + b.fit + b.ats) / 6);
  const limitations = [...r.limitations];
  if (truncated) limitations.unshift(`Резюме длиннее ${LIMITS.resume.toLocaleString('ru-RU')} символов — проанализирована первая часть текста.`);
  return {
    score: total, breakdown: b, strengths: r.strengths, improvements: r.improvements.slice(0, 5),
    missingSkills: r.missingSkills, experienceTips: r.experienceTips, limitations: limitations.slice(0, 4), engine: 'llm',
  };
}

/* ───────── Сравнение с вакансией ───────── */
const notVacancy = z.object({ isVacancy: z.literal(false), notVacancyReason: z.string().optional() });
const vacancyOk = z.object({
  isVacancy: z.literal(true).optional(),
  title: str,
  requirements: z.array(z.object({ text: str, status: z.enum(['match', 'partial', 'missing']), evidence: z.string().optional().default(''), note: z.string().optional().default('') })).min(1).max(20),
  suggestions: strList(6).default([]),
});
export const vacancySchema = z.union([notVacancy, vacancyOk]);

/** Совпадение без подтверждающего фрагмента резюме не засчитывается; оценка пересчитывается по требованиям. */
export function verifyRequirements(reqs: { text: string; status: 'match' | 'partial' | 'missing'; evidence?: string; note?: string }[], resume: string) {
  const out = reqs.slice(0, 15).map((r) => {
    if (r.status === 'missing' || evidenceFound(r.evidence, resume)) return { text: r.text, status: r.status, note: r.note || undefined, evidence: r.status === 'missing' ? undefined : r.evidence };
    return { text: r.text, status: 'missing' as const, note: 'В резюме не найдено подтверждения этому требованию.', evidence: undefined };
  });
  const m = out.filter((r) => r.status === 'match').length, pa = out.filter((r) => r.status === 'partial').length;
  return { requirements: out, matchScore: out.length ? Math.round(((m + pa * 0.5) / out.length) * 100) : 0 };
}

export async function analyzeVacancy(vacancyText: string, resumeText: string, p: ProfessionContext): Promise<VacancyAnalysis> {
  if (!vacancyText.trim()) throw new ApiError(400, 'Вставьте текст вакансии');
  if (!resumeText.trim()) throw new ApiError(400, 'Сначала загрузите резюме');
  if (looksLikeVacancy(vacancyText) === 'no') throw new ApiError(422, NOT_VACANCY);
  if (!llmEnabled()) return analyzeVacancyHeuristic(vacancyText, resumeText, p);
  const resume = cut(redactContacts(resumeText), LIMITS.resume);
  const r = await callJson('analyzeVacancy', vacancyPrompt(p, cut(vacancyText, LIMITS.vacancy), resume), vacancySchema);
  if (r.isVacancy === false) throw new ApiError(422, NOT_VACANCY);
  const { requirements, matchScore } = verifyRequirements(r.requirements, resume);
  return {
    title: r.title.slice(0, 120), matchScore, requirements,
    present: requirements.filter((x) => x.status !== 'missing').map((x) => x.text),
    missing: requirements.filter((x) => x.status === 'missing').map((x) => x.text),
    suggestions: r.suggestions, engine: 'llm',
  };
}

/* ───────── Адаптация резюме ───────── */
export const adaptSchema = z.object({
  changes: z.array(z.object({ lineIndex: z.number().int().min(0), adapted: z.string(), reason: z.string().default(''), section: z.string().optional() })).max(20),
});

/** Отбрасывает правки, которые меняют факты или подгоняют резюме под вакансию. */
export function filterChanges(raw: z.infer<typeof adaptSchema>['changes'], resumeLines: string[], resumeText: string, vacancyText: string): Change[] {
  const changes: Change[] = [];
  const used = new Set<number>();
  for (const c of raw) {
    const original = resumeLines[c.lineIndex];
    const adapted = c.adapted.trim();
    if (original === undefined || !original.trim() || !adapted || adapted === original.trim() || used.has(c.lineIndex)) continue;
    if (/\[(email|телефон|ссылка)\]|\[[^\]]{2,}\]/i.test(adapted) || /[\w.+-]+@[\w-]+\./.test(original)) continue; // заглушки и строки с контактами
    if (introducesNewFacts(original, adapted)) continue; // новые числа, термины, названия
    if (vacancyOnlyTerms(adapted, original, resumeText, vacancyText).length > 1) continue; // слова вакансии, которых нет в резюме
    used.add(c.lineIndex);
    changes.push({ id: `c${changes.length + 1}`, kind: 'replace', lineIndex: c.lineIndex, section: c.section?.trim() || 'Опыт', original, adapted, reason: c.reason.trim() || 'Формулировка точнее отвечает вакансии', status: 'pending' });
    if (changes.length >= 12) break;
  }
  return changes;
}

export async function adaptResume(resumeText: string, vacancyText: string, vacancy: VacancyAnalysis, p: ProfessionContext): Promise<{ changes: Change[]; engine: 'llm' | 'heuristic' }> {
  if (!llmEnabled()) return { changes: adaptResumeHeuristic(resumeText, vacancyText, vacancy, p), engine: 'heuristic' };
  const ls = resumeText.replace(/\r/g, '').split('\n');
  const numbered = cut(ls.map((l, i) => `${i}: ${redactContacts(l)}`).join('\n'), LIMITS.resume);
  const r = await callJson('adaptResume', adaptPrompt(p, cut(vacancyText, LIMITS.vacancy), numbered), adaptSchema, { maxTokens: 3500 });
  // Пустой список — честный результат «безопасных правок нет», а не повод подставлять правила
  return { changes: filterChanges(r.changes, ls, resumeText, vacancyText), engine: 'llm' };
}

/* ───────── Сопроводительное письмо ───────── */
/** Проверка письма: без заглушек, без чисел и технологий, которых нет в резюме и вакансии. */
export function letterProblems(text: string, resume: string, vacancy: string, userName: string): string | null {
  if (text.length < 80) return 'письмо слишком короткое';
  if (/\[[^\]]{2,}\]/.test(text)) return 'в письме есть заглушки в квадратных скобках';
  const nums = foreignNumbers(text, resume, vacancy);
  if (nums.length) return `в письме есть числа, которых нет в резюме и вакансии (${nums.slice(0, 3).join(', ')}) — убери их или используй только данные резюме`;
  const lat = foreignLatin(text, resume, vacancy, userName);
  if (lat.length) return `в письме упомянуты ${lat.slice(0, 3).join(', ')}, которых нет в резюме и вакансии`;
  return null;
}

export async function generateLetter(style: LetterStyle, input: LetterInput): Promise<{ text: string; engine: 'llm' | 'heuristic' }> {
  if (!llmEnabled()) return { text: letterHeuristic(style, input), engine: 'heuristic' };
  const resume = cut(redactContacts(input.resumeText), LIMITS.resume);
  const vacancy = cut(input.vacancyText, LIMITS.vacancy);
  const text = await callText('letter', letterPrompt({ p: input.p, style, userName: input.userName, variant: input.variant, vacancy, resume }),
    (t) => letterProblems(t, resume, vacancy, input.userName));
  return { text: text.replace(/^(тема|subject)\s*:.*\n+/i, '').trim(), engine: 'llm' };
}

/* ───────── Вопросы под вакансию ───────── */
export const questionsSchema = z.object({
  questions: z.array(z.object({
    text: str, category: str, keyPoints: strList(5).pipe(z.array(z.string()).min(2)), sampleAnswer: str,
    difficulty: z.number().int().min(1).max(3).catch(2),
  })).min(1).max(8),
});

export async function generateQuestions(o: { p: ProfessionContext; type: InterviewType; vacancyText: string; resumeText: string; gaps: string[] }) {
  const r = await callJson('interviewQuestions', interviewQuestionsPrompt({ p: o.p, type: o.type, vacancy: cut(o.vacancyText, LIMITS.vacancy), resume: cut(redactContacts(o.resumeText), LIMITS.resume), gaps: o.gaps.slice(0, 6) }), questionsSchema, { maxTokens: 3500 });
  return r.questions.slice(0, 5).map((q) => ({ ...q, text: q.text.slice(0, 400), category: q.category.slice(0, 60), sampleAnswer: q.sampleAnswer.slice(0, 1500) }));
}

/* ───────── Оценка ответа ───────── */
const crit = z.number().min(0).max(100).transform(Math.round);
export const feedbackSchema = z.object({
  criteria: z.object({ relevance: crit, specificity: crit, structure: crit, result: crit }),
  covered: strList(10).default([]), missed: strList(10).default([]),
  summary: str, tips: strList(5).pipe(z.array(z.string()).min(1)), improvedAnswer: z.string().default(''),
});

/** Оценка — взвешенная сумма критериев; пункты — только из списка ключевых; улучшенный ответ без новых чисел. */
export function finalizeFeedback(r: z.infer<typeof feedbackSchema>, keyPoints: string[], answer: string): AnswerFeedback {
  const c = r.criteria;
  const covered = matchKeyPoints(r.covered, keyPoints);
  const improved = r.improvedAnswer.trim();
  return {
    score: Math.round(c.relevance * 0.3 + c.specificity * 0.3 + c.structure * 0.2 + c.result * 0.2),
    criteria: c, covered, missed: keyPoints.filter((k) => !covered.includes(k)),
    summary: r.summary, tips: r.tips.slice(0, 4),
    improvedAnswer: improved && foreignNumbers(improved.replace(/\[[^\]]*\]/g, ''), answer).length === 0 ? improved.slice(0, 3000) : undefined,
    engine: 'llm',
  };
}

export async function evaluateAnswer(
  question: { text: string; category: string; keyPoints: string[]; sampleAnswer: string }, answer: string, p: ProfessionContext,
  ctx: { vacancyFocus?: string[]; previous?: { answer: string; score: number } | null } = {},
): Promise<AnswerFeedback> {
  if (!answer.trim()) throw new ApiError(400, 'Напишите ответ');
  if (!llmEnabled()) return feedbackHeuristic(answer, question.keyPoints, question.category);
  const safe = cut(redactContacts(answer), LIMITS.answer);
  const r = await callJson('evaluateAnswer', evaluatePrompt({
    p, question: question.text, keyPoints: question.keyPoints, answer: safe, vacancyFocus: (ctx.vacancyFocus ?? []).slice(0, 5),
    previous: ctx.previous ? { answer: cut(redactContacts(ctx.previous.answer), 1200), score: ctx.previous.score } : null,
  }), feedbackSchema);
  return finalizeFeedback(r, question.keyPoints, safe);
}
