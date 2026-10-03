import type { Change } from './types';

const effective = (c: Change) => c.edited ?? c.adapted;

/** Собирает итоговый текст резюме из исходного и принятых правок. */
export function applyChanges(resumeText: string, changes: Change[]): string {
  const ls = resumeText.replace(/\r/g, '').split('\n');
  const accepted = changes.filter((c) => c.status === 'accepted');
  const inserts = accepted.filter((c) => c.kind === 'insert');
  const out: string[] = [];
  inserts.filter((c) => c.lineIndex < 0).forEach((c) => out.push(effective(c)));
  ls.forEach((l, i) => {
    const rep = accepted.find((c) => c.kind === 'replace' && c.lineIndex === i);
    out.push(rep ? effective(rep) : l);
    inserts.filter((c) => c.lineIndex === i).forEach((c) => out.push(effective(c)));
  });
  return out.join('\n');
}

export type DiffPart = { text: string; type: 'same' | 'del' | 'ins' };

/** Пословный diff (LCS). */
export function diffWords(a: string, b: string): DiffPart[] {
  const x = a.split(/(\s+)/).filter(Boolean), y = b.split(/(\s+)/).filter(Boolean);
  const dp = Array.from({ length: x.length + 1 }, () => new Array<number>(y.length + 1).fill(0));
  for (let i = x.length - 1; i >= 0; i--) for (let j = y.length - 1; j >= 0; j--)
    dp[i][j] = x[i] === y[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const out: DiffPart[] = [];
  const push = (text: string, type: DiffPart['type']) => {
    const last = out[out.length - 1];
    if (last && last.type === type) last.text += text; else out.push({ text, type });
  };
  let i = 0, j = 0;
  while (i < x.length && j < y.length) {
    if (x[i] === y[j]) { push(x[i], 'same'); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) push(x[i++], 'del');
    else push(y[j++], 'ins');
  }
  while (i < x.length) push(x[i++], 'del');
  while (j < y.length) push(y[j++], 'ins');
  return out;
}
