// Защита от выдуманных фактов: правки AI не должны вносить новые числа и «имена собственные/технологии»,
// которых нет в исходном резюме.
import { norm, stem } from '../text';

const numbersOf = (s: string) => (s.match(/\d+(?:[.,]\d+)?/g) ?? []).map((n) => n.replace(',', '.'));
const latinTerms = (s: string) => (s.match(/[A-Za-z][A-Za-z0-9+#.\-]{1,}/g) ?? []).map((t) => t.toLowerCase());
// Слова с заглавной буквы не в начале предложения (названия компаний, продуктов)
const capsMid = (s: string) => [...s.matchAll(/(?<=[a-zа-яё,;:)»"]\s)([А-ЯЁ][а-яё]{2,}|«[^»]+»)/g)].map((m) => stem(m[1].replace(/[«»]/g, '')));

export function introducesNewFacts(source: string, adapted: string): string | null {
  const srcNums = new Set(numbersOf(source));
  for (const n of numbersOf(adapted)) if (!srcNums.has(n)) return `число «${n}»`;
  const srcN = norm(source);
  for (const t of latinTerms(adapted)) if (!srcN.includes(t)) return `термин «${t}»`;
  const srcStems = new Set(norm(source).match(/[a-zа-я0-9]+/g)?.map(stem) ?? []);
  for (const c of capsMid(adapted)) if (!srcStems.has(c)) return `название «${c}»`;
  return null;
}
