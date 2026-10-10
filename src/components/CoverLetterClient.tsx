'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { STYLE_LABELS, type LetterStyle } from '@/lib/types';
import { request } from '@/lib/client';
import Icon from './Icon';
import { Alert, Button, Segmented, Skeleton, Spinner } from './ui';
import { useToast } from './Toast';
import { useConfirm } from './Confirm';

interface L { id: string; text: string; style: LetterStyle }
interface V { id: string; title: string; matchScore: number; letters: L[] }
const SHORT: Record<LetterStyle, string> = { professional: 'Профессиональный', short: 'Краткий', personal: 'Персональный' };

/**
 * Письмо создаётся только по явному действию пользователя (кнопка «Создать письмо»)
 * или один раз при переходе со ссылки «Создать сопроводительное письмо» (?create=1), если писем ещё нет.
 * Смена стиля ничего не перезаписывает: стиль применяется к следующему созданному варианту.
 * Все варианты сохраняются — между ними можно переключаться.
 */
export default function CoverLetterClient({ vacancies, initialId, autoCreate = false }: { vacancies: V[]; initialId: string; autoCreate?: boolean }) {
  const [vid, setVid] = useState(initialId);
  const [all, setAll] = useState<Record<string, L[]>>(() => Object.fromEntries(vacancies.map((v) => [v.id, v.letters])));
  const [pos, setPos] = useState<Record<string, number>>({});
  const list = all[vid] ?? [];
  const idx = Math.min(pos[vid] ?? 0, Math.max(list.length - 1, 0));
  const letter = list[idx] as L | undefined;
  const [style, setStyle] = useState<LetterStyle>(list[0]?.style ?? 'professional');
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');
  const started = useRef(false);
  const toast = useToast();
  const confirm = useConfirm();
  const dirty = editing && !!letter && draft !== letter.text;

  async function generate() {
    if (busy) return;
    setBusy(true); setError(''); setEditing(false);
    const r = await request<{ id: string; text: string; style: LetterStyle }>('/api/cover-letters', { method: 'POST', json: { vacancyId: vid, style }, timeoutMs: 90_000 });
    setBusy(false);
    if (!r.ok) { setError(r.error); return; }
    const v = vid;
    setAll((a) => ({ ...a, [v]: [{ id: r.data.id, text: r.data.text, style: r.data.style }, ...(a[v] ?? [])] }));
    setPos((p) => ({ ...p, [v]: 0 }));
    toast(list.length ? 'Готов новый вариант письма — предыдущие сохранены' : 'Письмо готово');
  }

  // Переход по «Создать сопроводительное письмо»: создаём один раз, только если писем ещё нет
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    if (autoCreate) {
      window.history.replaceState(null, '', `/cover-letter?vacancy=${initialId}`);
      if (!(all[initialId]?.length)) generate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Не теряем несохранённые правки при закрытии вкладки
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [dirty]);

  async function switchVacancy(id: string) {
    if (dirty && !(await confirm({ title: 'Уйти без сохранения?', text: 'В письме есть несохранённые правки. Если переключить вакансию, они пропадут.', confirm: 'Не сохранять', danger: true }))) return;
    setVid(id); setEditing(false); setError('');
    const first = all[id]?.[pos[id] ?? 0];
    if (first) setStyle(first.style);
  }

  async function save() {
    if (!letter || saving) return;
    setSaving(true); setError('');
    const r = await request(`/api/cover-letters/${letter.id}`, { method: 'PATCH', json: { text: draft } });
    setSaving(false);
    if (!r.ok) { setError(`${r.error} Ваш текст остался в редакторе.`); return; }
    const v = vid, i = idx;
    setAll((a) => ({ ...a, [v]: a[v].map((l, j) => (j === i ? { ...l, text: draft } : l)) }));
    setEditing(false); toast('Изменения сохранены');
  }
  async function copy() {
    if (!letter) return;
    try { await navigator.clipboard.writeText(letter.text); setCopied(true); toast('Письмо скопировано в буфер обмена'); setTimeout(() => setCopied(false), 1600); } catch { toast('Не удалось скопировать — выделите текст вручную', 'bad'); }
  }
  function go(d: number) { setPos((p) => ({ ...p, [vid]: idx + d })); setEditing(false); }

  const words = letter ? letter.text.trim().split(/\s+/).length : 0;
  const options = (Object.keys(STYLE_LABELS) as LetterStyle[]).map((st) => ({ value: st, label: SHORT[st] }));
  const createLabel = list.length ? 'Создать другой вариант' : 'Создать письмо';

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[300px_minmax(0,1fr)] lg:items-start lg:gap-8">
      <aside className="space-y-5 rounded-2xl border border-line bg-white p-5 lg:sticky lg:top-24">
        <div>
          <label htmlFor="vac" className="mb-2 block text-[13px] font-medium text-muted">Вакансия</label>
          <div className="relative">
            <select id="vac" value={vid} disabled={busy} onChange={(e) => switchVacancy(e.target.value)}
              className="h-11 w-full appearance-none truncate rounded-lg border border-line-strong bg-white pl-3.5 pr-9 text-sm outline-none focus:border-accent-500 focus:shadow-[0_0_0_3px_var(--color-accent-100)] disabled:opacity-60">
              {vacancies.map((v) => <option key={v.id} value={v.id}>{v.title} — {v.matchScore}%</option>)}
            </select>
            <Icon name="chevron-down" size={16} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted" />
          </div>
        </div>
        <div>
          <div className="mb-2 text-[13px] font-medium text-muted">Стиль письма</div>
          <div className="lg:hidden"><Segmented size="sm" label="Стиль письма" value={style} onChange={(v) => !busy && setStyle(v)} options={options} /></div>
          <div role="radiogroup" aria-label="Стиль письма" className="hidden gap-1 lg:grid">
            {options.map((o) => (
              <button key={o.value} type="button" role="radio" aria-checked={style === o.value} disabled={busy} onClick={() => setStyle(o.value)}
                className={`flex h-10 items-center justify-between rounded-lg px-3 text-sm transition-colors ${style === o.value ? 'bg-ink font-medium text-milk' : 'text-ink-2 hover:bg-subtle hover:text-ink'}`}>{o.label}{style === o.value && <Icon name="check" size={15} strokeWidth={2.3} />}</button>
            ))}
          </div>
          {letter && style !== letter.style && <p className="mt-2 text-xs leading-relaxed text-muted">Стиль применится к новому варианту — текущее письмо не изменится.</p>}
        </div>
        <Button className="w-full" onClick={generate} disabled={busy || editing} data-testid="create-letter">
          {busy ? <><Spinner />Готовим письмо…</> : <><Icon name={list.length ? 'refresh' : 'mail'} size={15} />{createLabel}</>}
        </Button>
        <Link href={`/vacancies/${vid}`} className="inline-flex items-center gap-1.5 text-[13px] font-medium text-accent-600 hover:text-accent-700">Анализ этой вакансии<Icon name="arrow-right" size={13} /></Link>
      </aside>

      <section className="min-w-0 rounded-2xl border border-line bg-white" aria-label="Текст письма">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3.5 sm:px-6">
          <div className="flex items-center gap-2">
            {list.length > 1 && !busy && (
              <div className="flex items-center gap-1" aria-label="Варианты письма">
                <button type="button" aria-label="Более новый вариант" disabled={idx === 0 || editing} onClick={() => go(-1)} className="grid h-7 w-7 place-items-center rounded-md text-ink-2 hover:bg-subtle disabled:opacity-30"><Icon name="chevron-left" size={15} /></button>
                <span className="tabular text-[13px] text-ink-2" data-testid="letter-variant">Вариант {list.length - idx} из {list.length}</span>
                <button type="button" aria-label="Более ранний вариант" disabled={idx >= list.length - 1 || editing} onClick={() => go(1)} className="grid h-7 w-7 place-items-center rounded-md text-ink-2 hover:bg-subtle disabled:opacity-30"><Icon name="chevron-right" size={15} /></button>
              </div>
            )}
            <span className="tabular text-[13px] text-muted">{busy ? 'Готовим письмо…' : letter ? `${words} слов · ${SHORT[letter.style].toLowerCase()} стиль` : ''}</span>
          </div>
          {letter && !busy && !editing && (
            <div className="flex flex-wrap gap-1.5">
              <Button size="sm" variant="ghost" onClick={() => { setDraft(letter.text); setEditing(true); }}><Icon name="edit" size={14} />Редактировать</Button>
              <Button size="sm" onClick={copy}>{copied ? <><Icon name="check" size={14} strokeWidth={2.4} />Скопировано</> : <><Icon name="copy" size={14} />Копировать</>}</Button>
            </div>
          )}
        </div>
        <div className="px-5 py-6 sm:px-8 sm:py-8">
          {error && <Alert className="mb-4">{error}{!editing && <button type="button" onClick={generate} className="ml-2 font-medium underline underline-offset-2">Повторить</button>}</Alert>}
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
                {!draft.trim() && <p className="mt-1.5 text-xs text-bad">Письмо не может быть пустым.</p>}
                <div className="mt-3 flex gap-2">
                  <Button onClick={save} disabled={!draft.trim() || saving}>{saving ? <><Spinner />Сохраняем…</> : 'Сохранить'}</Button>
                  <Button variant="ghost" disabled={saving} onClick={() => setEditing(false)}>Отмена</Button>
                </div>
              </>
            ) : (
              <div className="max-w-[640px] user-text whitespace-pre-wrap text-[15.5px] leading-[1.75]" data-testid="letter-text">{letter.text}</div>
            )
          ) : (
            <div className="py-6 text-center">
              <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-subtle text-ink-2"><Icon name="mail" size={20} /></span>
              <h2 className="mt-4 font-semibold">Письма к этой вакансии ещё нет</h2>
              <p className="mx-auto mt-1.5 max-w-sm text-sm leading-relaxed text-ink-2">Выберите стиль слева и нажмите «Создать письмо». Обычно это занимает несколько секунд.</p>
            </div>
          )}
        </div>
        <p className="border-t border-line px-5 py-3.5 text-xs text-muted sm:px-6">Письмо строится только на фактах из вашего резюме. Перед отправкой прочитайте его и при необходимости отредактируйте.</p>
      </section>
    </div>
  );
}
