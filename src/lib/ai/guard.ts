// Защита от выдуманных фактов: правки AI не должны вносить новые числа и «имена собственные/технологии»,
// которых нет в исходном резюме.
import { norm, stem } from '../text';

const numbersOf = (s: string) => (s.match(/\d+(?:[.,]\d+)?/g) ?? []).map((n) => n.replace(',', '.'));
const latinTerms = (s: string) => (s.match(/[A-Za-z][A-Za-z0-9+#.\-]{1,}/g) ?? []).map((t) => t.toLowerCase());
// Слова с заглавной буквы не в начале предложения (названия компаний, продуктов)
const capsMid = (s: string) => [...s.matchAll(/(?<=[a-zа-яё,;:)»"]\s)([А-ЯЁ][а-яё]{2,}|«[^»]+»)/g)].map((m) => stem(m[1].replace(/[«»]/g, '')));

/** Расстояние Левенштейна не больше max (для исправления опечаток: Flatter → Flutter). */
function closeTo(a: string, b: string, max: number) {
  if (Math.abs(a.length - b.length) > max) return false;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    if (Math.min(...cur) > max) return false;
    prev = cur;
  }
  return prev[b.length] <= max;
}

/**
 * Проверка правки строки. Числа — только из этой же строки (их перенос из другого места искажает факты).
 * Термины и названия — из любого места резюме; исправление опечатки в термине строки тоже допустимо.
 * resume не передан — сверка только со строкой.
 */
export function introducesNewFacts(source: string, adapted: string, resume = source): string | null {
  const srcNums = new Set(numbersOf(source));
  for (const n of numbersOf(adapted)) if (!srcNums.has(n)) return `число «${n}»`;
  const resN = norm(resume);
  const lineTerms = latinTerms(source);
  for (const t of latinTerms(adapted)) {
    if (resN.includes(t)) continue;
    if (t.length >= 4 && lineTerms.some((s) => closeTo(s, t, t.length >= 7 ? 2 : 1))) continue;
    return `термин «${t}»`;
  }
  const resStems = new Set(resN.match(/[a-zа-я0-9]+/g)?.map(stem) ?? []);
  for (const c of capsMid(adapted)) if (!resStems.has(c)) return `название «${c}»`;
  return null;
}
