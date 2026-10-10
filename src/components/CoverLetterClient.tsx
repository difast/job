'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { STYLE_LABELS, type LetterStyle } from '@/lib/types';
import Icon from './Icon';
import { Alert, Button, Segmented, Skeleton, Spinner } from './ui';
import { useToast } from './Toast';

interface V { id: string; title: string; matchScore: number; letter: { id: string; text: string; style: LetterStyle } | null }
const SHORT: Record<LetterStyle, string> = { professional: 'Профессиональный', short: 'Краткий', personal: 'Персональный' };

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
  const auto = useRef<Set<string>>(new Set());
  const toast = useToast();

  async function generate(v = vid, s = style, manual = true) {
    setBusy(true); setError(''); setEditing(false);
    try {
      const r = await fetch('/api/cover-letters', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ vacancyId: v, style: s }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setError(d.error ?? 'Не удалось создать письмо'); setBusy(false); return; }
      setLetters((l) => ({ ...l, [v]: { id: d.id, text: d.text } }));
      if (manual) toast('Готов новый вариант письма');
    } catch { setError('Нет соединения с сервером. Повторите попытку.'); }
    setBusy(false);
  }

  // После выбора вакансии письмо генерируется автоматически
  useEffect(() => {
    if (!letters[vid] && !auto.current.has(vid)) { auto.current.add(vid); generate(vid, style, false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vid]);

  function changeStyle(s: LetterStyle) { setStyle(s); generate(vid, s); }

  async function save() {
    const r = await fetch(`/api/cover-letters/${letter.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: draft }) });
    if (!r.ok) { setError((await r.json().catch(() => ({}))).error ?? 'Не удалось сохранить'); return; }
    setLetters((l) => ({ ...l, [vid]: { ...letter, text: draft } })); setEditing(false); toast('Изменения сохранены');
  }
  async function copy() {
    try { await navigator.clipboard.writeText(letter.text); setCopied(true); toast('Письмо скопировано в буфер обмена'); setTimeout(() => setCopied(false), 1600); } catch { toast('Не удалось скопировать — выделите текст вручную', 'bad'); }
  }

  const words = letter ? letter.text.trim().split(/\s+/).length : 0;
  const options = (Object.keys(STYLE_LABELS) as LetterStyle[]).map((st) => ({ value: st, label: SHORT[st] }));

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[300px_minmax(0,1fr)] lg:items-start lg:gap-8">
      <aside className="space-y-5 rounded-2xl border border-line bg-white p-5 lg:sticky lg:top-24">
        <div>
          <label htmlFor="vac" className="mb-2 block text-[13px] font-medium text-muted">Вакансия</label>
          <div className="relative">
            <select id="vac" value={vid} onChange={(e) => { setVid(e.target.value); setEditing(false); setError(''); const l = vacancies.find((v) => v.id === e.target.value)?.letter; if (l) setStyle(l.style); }}
              className="h-11 w-full appearance-none truncate rounded-lg border border-line-strong bg-white pl-3.5 pr-9 text-sm outline-none focus:border-accent-500 focus:shadow-[0_0_0_3px_var(--color-accent-100)]">
              {vacancies.map((v) => <option key={v.id} value={v.id}>{v.title} — {v.matchScore}%</option>)}
            </select>
            <Icon name="chevron-down" size={16} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted" />
          </div>
        </div>
        <div>
          <div className="mb-2 text-[13px] font-medium text-muted">Стиль письма</div>
          <div className="lg:hidden"><Segmented size="sm" label="Стиль письма" value={style} onChange={(v) => !busy && changeStyle(v)} options={options} /></div>
          <div role="radiogroup" aria-label="Стиль письма" className="hidden gap-1 lg:grid">
            {options.map((o) => (
              <button key={o.value} role="radio" aria-checked={style === o.value} disabled={busy} onClick={() => changeStyle(o.value)}
                className={`flex h-10 items-center justify-between rounded-lg px-3 text-sm transition-colors ${style === o.value ? 'bg-ink font-medium text-milk' : 'text-ink-2 hover:bg-subtle hover:text-ink'}`}>{o.label}{style === o.value && <Icon name="check" size={15} strokeWidth={2.3} />}</button>
            ))}
          </div>
        </div>
        <Link href={`/vacancies/${vid}`} className="inline-flex items-center gap-1.5 text-[13px] font-medium text-accent-600 hover:text-accent-700">Анализ этой вакансии<Icon name="arrow-right" size={13} /></Link>
      </aside>

      <section className="min-w-0 rounded-2xl border border-line bg-white" aria-label="Текст письма">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3.5 sm:px-6">
          <span className="tabular text-[13px] text-muted">{busy ? 'Готовим письмо…' : letter ? `${words} слов · ${SHORT[style].toLowerCase()} стиль` : ''}</span>
          {letter && !busy && !editing && (
            <div className="flex flex-wrap gap-1.5">
              <Button size="sm" variant="ghost" onClick={() => { setDraft(letter.text); setEditing(true); }}><Icon name="edit" size={14} />Редактировать</Button>
              <Button size="sm" variant="ghost" onClick={() => generate()}><Icon name="refresh" size={14} />Создать другой вариант</Button>
              <Button size="sm" onClick={copy}>{copied ? <><Icon name="check" size={14} strokeWidth={2.4} />Скопировано</> : <><Icon name="copy" size={14} />Копировать</>}</Button>
            </div>
          )}
        </div>
        <div className="px-5 py-6 sm:px-8 sm:py-8">
          {error && <Alert className="mb-4">{error}</Alert>}
          {busy ? (
            <div role="status" aria-live="polite">
              <div className="mb-5 flex items-center gap-2.5 text-sm text-ink-2"><Spinner className="text-accent-600" />Готовим письмо на основе вашего резюме…</div>
              <div className="space-y-3"><Skeleton className="h-4 w-1/3" /><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-11/12" /><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-4/5" /><Skeleton className="h-4 w-1/4" /></div>
            </div>
          ) : letter ? (
            editing ? (
              <>
                <textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={18} aria-label="Текст письма" autoFocus
                  className="w-full resize-y rounded-lg border border-line-strong p-4 text-[15px] leading-relaxed outline-none focus:border-accent-500 focus:shadow-[0_0_0_3px_var(--color-accent-100)]" />
                <div className="mt-3 flex gap-2"><Button onClick={save} disabled={!draft.trim()}>Сохранить</Button><Button variant="ghost" onClick={() => setEditing(false)}>Отмена</Button></div>
              </>
            ) : (
              <div className="max-w-[640px] user-text whitespace-pre-wrap text-[15.5px] leading-[1.75]" data-testid="letter-text">{letter.text}</div>
            )
          ) : null}
        </div>
        <p className="border-t border-line px-5 py-3.5 text-xs text-muted sm:px-6">Письмо строится только на фактах из вашего резюме. Перед отправкой прочитайте его и при необходимости отредактируйте.</p>
      </section>
    </div>
  );
}
