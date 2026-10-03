// Общие текстовые утилиты для разбора резюме/вакансий (RU/EN).

export const STOP = new Set(['и', 'в', 'во', 'на', 'с', 'со', 'по', 'для', 'от', 'до', 'за', 'из', 'к', 'о', 'об', 'а', 'но', 'или', 'как', 'что', 'это', 'не', 'у', 'при', 'над', 'под', 'the', 'and', 'of', 'to', 'in', 'a', 'опыт', 'опыта', 'работы', 'работа', 'знание', 'знания', 'умение', 'навыки', 'навык', 'владение', 'уверенное', 'понимание', 'наличие', 'готовность', 'желательно', 'будет', 'плюсом', 'преимуществом', 'года', 'лет', 'год', 'более', 'менее', 'минимум', 'от', 'ваш', 'вашей', 'нашей', 'компании', 'проектов', 'задач', 'навыками', 'уровне', 'уровень']);

export const norm = (s: string) => s.toLowerCase().replace(/ё/g, 'е').replace(/[‐‑–—]/g, '-');

/** Грубый стеммер: достаточно для сопоставления «аналитика/аналитики/аналитику». */
export function stem(w: string): string {
  const x = norm(w);
  if (/^[a-z0-9+#.\-]+$/.test(x)) return x.replace(/s$/, '');
  return x.length > 5 ? x.slice(0, 5) : x.length > 4 ? x.slice(0, 4) : x;
}

export function tokens(s: string): string[] {
  return (norm(s).match(/[a-zа-я0-9+#.\-]{2,}/g) ?? []).map((t) => t.replace(/^[.\-]+|[.\-]+$/g, '')).filter((t) => t.length >= 2);
}

export function keyStems(s: string): string[] {
  return [...new Set(tokens(s).filter((t) => !STOP.has(t) && t.length > 2).map(stem))];
}

export function stemSet(s: string): Set<string> {
  return new Set(tokens(s).map(stem));
}

/** Доля ключевых слов `phrase`, найденных в тексте (с учётом фразы целиком). */
export function coverage(phrase: string, textNorm: string, textStems: Set<string>): number {
  const p = norm(phrase).trim();
  if (p && textNorm.includes(p)) return 1;
  const ks = keyStems(phrase);
  if (!ks.length) return 0;
  return ks.filter((k) => textStems.has(k)).length / ks.length;
}

export function lines(text: string): string[] {
  return text.replace(/\r/g, '').split('\n');
}

export const BULLET_RE = /^\s*(?:[-•*·▪●◦–—]|\d+[.)])\s+/;
export const stripBullet = (l: string) => l.replace(BULLET_RE, '').trim();

export const words = (s: string) => (s.match(/[A-Za-zА-Яа-яЁё0-9]+/g) ?? []).length;

const PRESENT = '(?:н\\.?\\s?в\\.?|настоящ\\w*|по\\s+настоящее\\s+время|present|now|сейчас|текущ\\w*)';
const RANGE_RE = new RegExp(`((?:19|20)\\d{2})\\s*(?:г\\.?)?\\s*[-–—]\\s*((?:19|20)\\d{2}|${PRESENT})`, 'gi');

/** Оценка суммарного стажа по диапазонам годов («2019 – 2023», «2021 – н.в.»). */
export function estimateYears(text: string, now = new Date()): number | null {
  const spans: [number, number][] = [];
  for (const m of norm(text).matchAll(RANGE_RE)) {
    const a = +m[1];
    const b = /\d{4}/.test(m[2]) ? +m[2] : now.getFullYear();
    if (b >= a && b - a <= 45) spans.push([a, b]);
  }
  if (!spans.length) return null;
  spans.sort((x, y) => x[0] - y[0]);
  let total = 0, [s, e] = spans[0];
  for (const [a, b] of spans.slice(1)) {
    if (a <= e) e = Math.max(e, b);
    else { total += e - s; [s, e] = [a, b]; }
  }
  total += e - s;
  return Math.max(total, 0);
}

export const SECTION_PATTERNS: Record<string, RegExp> = {
  summary: /^(о себе|обо мне|summary|profile|профиль|цель|целевая позиция|коротко о себе)\s*:?\s*$/i,
  experience: /^(опыт работы|опыт|work experience|experience|профессиональный опыт|карьера)\s*:?\s*$/i,
  education: /^(образование|education|курсы|обучение)\s*:?\s*$/i,
  skills: /^(навыки|ключевые навыки|профессиональные навыки|skills|key skills|технологии|стек|компетенции)\s*:?\s*$/i,
  contacts: /^(контакты|contacts|контактная информация)\s*:?\s*$/i,
  languages: /^(языки|languages|иностранные языки)\s*:?\s*$/i,
};

export function detectSections(ls: string[]): Record<string, number> {
  const found: Record<string, number> = {};
  ls.forEach((l, i) => {
    const t = l.trim().replace(/[#*_]/g, '').trim();
    if (!t || t.length > 40) return;
    for (const [k, re] of Object.entries(SECTION_PATTERNS)) if (re.test(t) && !(k in found)) found[k] = i;
  });
  return found;
}

export const EMAIL_RE = /[\w.+-]+@[\w-]+\.[\w.-]+/;
export const PHONE_RE = /(?:\+?\d[\d\s\-()]{8,}\d)/;
export const METRIC_RE = /\d+[\d\s.,]*\s*(?:%|процент|тыс|млн|млрд|руб|₽|\$|€|k\b|м\b|раз|x\b|чел|клиент|пользоват|заказ|сделк|проект)|[+↑↓-]\s?\d+\s*%|\bв\s+\d+(?:[.,]\d+)?\s+раз/i;
export const ACHIEVE_VERB_RE = /(увелич|сократ|выросл|вырос|снизил|снижен|запустил|запуск|внедрил|внедрен|разработал|оптимизир|достиг|привлек|привёл|привел|улучшил|повысил|сэконом|автоматизир|построил|выстроил|открыл|масштабир|реализовал|довёл|довел|вывел|выиграл|achiev|increas|reduc|launch|improv|built|led|deliver)/i;
