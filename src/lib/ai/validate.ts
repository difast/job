// Серверные проверки вокруг ИИ: минимизация персональных данных, предварительная проверка входа
// и проверка результата на выдуманные факты. Не зависят от провайдера — работают и в упрощённом режиме.
import { norm, stem } from '../text';

/* ───────── Персональные данные ───────── */
const EMAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g;
// Телефон: +7/8 и международный формат с 10+ цифрами группами — диапазоны лет («2019 - 2023») не задеваются
const PHONE = /(?:\+\d{1,3}|\b8)[\s(.-]*\d{3}[\s).-]*\d{3}[\s.-]*\d{2}[\s.-]*\d{2}\b/g;
const URL_RE = /\b(?:https?:\/\/|www\.)[^\s,;)»"]+|\b(?:t\.me|vk\.com|linkedin\.com|github\.com|hh\.ru)\/[^\s,;)»"]+/gi;

/** Контакты не нужны для анализа — в модель уходят метки вместо них. */
export const redactContacts = (s: string) => s.replace(EMAIL, '[email]').replace(URL_RE, '[ссылка]').replace(PHONE, '[телефон]');

/* ───────── Предварительная проверка входа ───────── */
export type Verdict = 'yes' | 'no' | 'unsure';

const RESUME_SIGNALS = /(опыт работы|место работы|образование|ключевые навыки|навыки|о себе|обязанности|достижения|должность|резюме|soft skills|hard skills|work experience|experience|education|skills|summary|employment|курсы|сертификат|желаемая должность|занятость)/gi;
const YEAR = /\b(?:19[6-9]\d|20[0-4]\d)\b/g;

/** Похоже ли на резюме: явные разделы, годы, контакты. «no» — точно не резюме, «unsure» — решит ИИ. */
export function looksLikeResume(text: string): Verdict {
  const signals = new Set((text.match(RESUME_SIGNALS) ?? []).map((s) => s.toLowerCase())).size;
  const years = (text.match(YEAR) ?? []).length;
  const contact = /[\w.+-]+@[\w-]+\.|(?:\+7|\b8)[\s(-]*\d{3}/.test(text);
  if (signals >= 2 && (years >= 1 || contact)) return 'yes';
  if (signals === 0 && years === 0 && !contact) return 'no';
  return 'unsure';
}

const VACANCY_SIGNALS = /(требовани|обязанност|условия|мы предлагаем|предлагаем|ищем|вакансия|зарплат|заработн|график|оформление|опыт работы от|опыт от|задачи|ожидаем|будет плюсом|responsibilit|requirements|we offer|looking for|qualifications)/gi;

export function looksLikeVacancy(text: string): Verdict {
  const signals = new Set((text.match(VACANCY_SIGNALS) ?? []).map((s) => s.toLowerCase())).size;
  if (signals >= 2) return 'yes';
  if (signals === 0) return 'no';
  return 'unsure';
}

/* ───────── Проверка результата ───────── */
const wordStems = (s: string) => (norm(s).match(/[a-zа-я0-9+#]+/g) ?? []).filter((w) => w.length > 2).map(stem);

/** Подтверждается ли цитата текстом резюме: дословно или ≥ 75 % значимых слов цитаты есть в резюме. */
export function evidenceFound(evidence: string | undefined, source: string): boolean {
  const e = (evidence ?? '').trim();
  if (e.length < 3) return false;
  const clean = (s: string) => norm(s).replace(/[^a-zа-я0-9+#]+/g, ' ').trim();
  if (clean(source).includes(clean(e))) return true;
  const ev = wordStems(e);
  if (ev.length < 2) return false;
  const src = new Set(wordStems(source));
  return ev.filter((w) => src.has(w)).length / ev.length >= 0.75;
}

export const numbersIn = (s: string) => new Set((s.match(/\d+(?:[.,]\d+)?/g) ?? []).map((n) => n.replace(',', '.')));
export const latinIn = (s: string) => new Set((s.match(/[A-Za-z][A-Za-z0-9+#.\-]{1,}/g) ?? []).map((t) => t.toLowerCase().replace(/[.\-]+$/, '')));

/** Числа в тексте, которых нет ни в одном из источников (годы опыта, проценты, суммы — признак выдумки). */
export function foreignNumbers(text: string, ...sources: string[]) {
  const known = new Set(sources.flatMap((s) => [...numbersIn(s)]));
  return [...numbersIn(text)].filter((n) => !known.has(n));
}

/** Латинские термины (технологии, продукты), которых нет в источниках. */
export function foreignLatin(text: string, ...sources: string[]) {
  const src = sources.map(norm).join('\n');
  return [...latinIn(text)].filter((t) => !src.includes(t));
}

/** Слова из вакансии, которых нет во всём резюме, — их появление в правке строки означает подгонку под вакансию. */
export function vacancyOnlyTerms(adapted: string, original: string, resume: string, vacancy: string) {
  const res = new Set(wordStems(resume));
  const orig = new Set(wordStems(original));
  const vac = new Set(wordStems(vacancy));
  return [...new Set(wordStems(adapted))].filter((w) => w.length >= 5 && !orig.has(w) && !res.has(w) && vac.has(w));
}

/** Сопоставляет пункты модели со списком ключевых пунктов (дословно или по большинству слов). */
export function matchKeyPoints(items: string[], keyPoints: string[]) {
  const pick = (it: string) => keyPoints.find((k) => norm(k).trim() === norm(it).trim())
    ?? keyPoints.find((k) => { const a = wordStems(k); const b = new Set(wordStems(it)); return a.length > 0 && a.filter((w) => b.has(w)).length / a.length >= 0.6; });
  return [...new Set(items.map(pick).filter((x): x is string => !!x))];
}
