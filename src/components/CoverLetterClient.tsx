'use client';
import Link from 'next/link';
import { useState } from 'react';
import { STYLE_LABELS, type LetterStyle } from '@/lib/types';
import { Button, Card, Spinner, cx } from './ui';

interface V { id: string; title: string; matchScore: number; letter: { id: string; text: string; style: LetterStyle } | null }

export default function CoverLetterClient({ vacancies, initialId }: { vacancies: V[]; initialId: string }) {
  const [vid, setVid] = useState(initialId);
  const cur = vacancies.find((v) => v.id === vid)!;
  const [style, setStyle] = useState<LetterStyle>(cur.letter?.style ?? 'professional');
  const [letters, setLetters] = useState<Record<string, { id: string; text: string }>>(
    Object.fromEntries(vacancies.filter((v) => v.letter).map((v) => [v.id, { id: v.letter!.id, text: v.letter!.text }])),
  );
  const letter = letters[vid];
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');

  async function generate() {
    setBusy(true); setError(''); setEditing(false);
    const r = await fetch('/api/cover-letters', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ vacancyId: vid, style }) });
    const d = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) { setError(d.error ?? 'Не удалось сгенерировать письмо'); return; }
    setLetters((l) => ({ ...l, [vid]: { id: d.id, text: d.text } }));
  }
  async function save() {
    const r = await fetch(`/api/cover-letters/${letter.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: draft }) });
    if (!r.ok) { setError((await r.json().catch(() => ({}))).error ?? 'Не удалось сохранить'); return; }
    setLetters((l) => ({ ...l, [vid]: { ...letter, text: draft } }));
    setEditing(false);
  }
  async function copy() {
    try { await navigator.clipboard.writeText(letter.text); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { setError('Не удалось скопировать — выделите текст вручную'); }
  }

  return (
    <div className="space-y-5">
      <Card>
        <label htmlFor="vac" className="mb-2 block text-sm font-medium">Вакансия</label>
        <select id="vac" value={vid} onChange={(e) => { setVid(e.target.value); setEditing(false); setError(''); const l = vacancies.find((v) => v.id === e.target.value)?.letter; if (l) setStyle(l.style); }}
          className="h-10 w-full rounded-lg border border-line bg-white px-3 text-sm outline-none focus:border-accent-500">
          {vacancies.map((v) => <option key={v.id} value={v.id}>{v.title} — {v.matchScore}%</option>)}
        </select>
        <div className="mt-5 text-sm font-medium">Стиль</div>
        <div className="mt-2 flex flex-wrap gap-2" role="radiogroup" aria-label="Стиль письма">
          {(Object.keys(STYLE_LABELS) as LetterStyle[]).map((s) => (
            <button key={s} role="radio" aria-checked={style === s} onClick={() => setStyle(s)}
              className={cx('rounded-lg border px-3 py-1.5 text-sm transition', style === s ? 'border-accent-600 bg-accent-50 font-medium text-accent-700' : 'border-line bg-white hover:bg-slate-50')}>{STYLE_LABELS[s]}</button>
          ))}
        </div>
        {!letter && <div className="mt-5"><Button onClick={generate} disabled={busy}>{busy && <Spinner />}Создать письмо</Button></div>}
      </Card>
      {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {letter && (
        <Card>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-muted">Сопроводительное письмо</h2>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" onClick={copy}>{copied ? 'Скопировано ✓' : 'Копировать'}</Button>
              <Button size="sm" variant="secondary" onClick={generate} disabled={busy}>{busy && <Spinner />}Перегенерировать</Button>
              {!editing && <Button size="sm" variant="secondary" onClick={() => { setDraft(letter.text); setEditing(true); }}>Редактировать</Button>}
            </div>
          </div>
          {editing ? (
            <>
              <textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={14} aria-label="Текст письма"
                className="w-full rounded-lg border border-line p-3 text-sm leading-relaxed outline-none focus:border-accent-500 focus:ring-2 focus:ring-accent-100" />
              <div className="mt-3 flex gap-2"><Button size="sm" onClick={save}>Сохранить</Button><Button size="sm" variant="ghost" onClick={() => setEditing(false)}>Отмена</Button></div>
            </>
          ) : (
            <div className="whitespace-pre-wrap text-sm leading-relaxed" data-testid="letter-text">{letter.text}</div>
          )}
        </Card>
      )}
      <p className="text-xs text-muted">Письмо строится только на фактах из вашего резюме. <Link href="/vacancies" className="text-accent-600 hover:underline">Добавить другую вакансию</Link></p>
    </div>
  );
}
