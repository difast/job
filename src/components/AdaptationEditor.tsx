'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { applyChanges, diffWords } from '@/lib/changes';
import type { Change } from '@/lib/types';
import Icon from './Icon';
import { Alert, Badge, Button, buttonClass, Card, EmptyState } from './ui';

function Diff({ a, b, side }: { a: string; b: string; side: 'del' | 'ins' | 'both' }) {
  return (
    <span>
      {diffWords(a, b).map((p, i) => p.type === 'same' ? <span key={i}>{p.text}</span>
        : p.type === 'del' ? (side !== 'ins' ? <span key={i} className="diff-del">{p.text}</span> : null)
        : (side !== 'del' ? <span key={i} className="diff-ins">{p.text}</span> : null))}
    </span>
  );
}

const eff = (c: Change) => c.edited ?? c.adapted;

export default function AdaptationEditor({ id, vacancyId, vacancyTitle, original, initial, engine }: { id: string; vacancyId: string; vacancyTitle: string; original: string; initial: Change[]; engine: string }) {
  const [changes, setChanges] = useState<Change[]>(initial);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const finalText = useMemo(() => applyChanges(original, changes), [original, changes]);
  const accepted = changes.filter((c) => c.status === 'accepted').length;
  const origLines = useMemo(() => original.replace(/\r/g, '').split('\n'), [original]);

  async function patch(body: object) {
    setError('');
    try {
      const r = await fetch(`/api/adaptations/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setError(d.error ?? 'Не удалось сохранить'); return; }
      setChanges(d.changes);
    } catch { setError('Нет соединения с сервером. Изменение не сохранено.'); }
  }

  const side = useMemo(() => {
    const rows: { text: string; orig?: string; changed: boolean }[] = [];
    const acc = changes.filter((c) => c.status === 'accepted');
    acc.filter((c) => c.kind === 'insert' && c.lineIndex < 0).forEach((c) => rows.push({ text: eff(c), changed: true }));
    origLines.forEach((l, i) => {
      const rep = acc.find((c) => c.kind === 'replace' && c.lineIndex === i);
      rows.push(rep ? { text: eff(rep), orig: l, changed: true } : { text: l, changed: false });
      acc.filter((c) => c.kind === 'insert' && c.lineIndex === i).forEach((c) => eff(c).split('\n').forEach((t) => rows.push({ text: t, changed: true })));
    });
    return rows;
  }, [changes, origLines]);

  if (!changes.length) {
    return <EmptyState icon="check-circle" title="Правок не потребовалось" text="Мы не нашли безопасных улучшений формулировок: резюме уже хорошо подходит под вакансию, а выдумывать факты мы не будем. Можно скачать текущую версию." action={<a href={`/api/adaptations/${id}/pdf`} download className={buttonClass({ size: 'lg' })}><Icon name="download" size={16} />Скачать PDF</a>} />;
  }

  return (
    <div className="space-y-10">
      <div className="sticky top-14 z-20 -mx-4 flex flex-wrap items-center justify-between gap-3 border-b border-line bg-canvas/90 px-4 py-3 backdrop-blur-md sm:-mx-8 sm:px-8 lg:top-16">
        <p className="text-sm text-ink-2">Принято правок: <b className="tabular font-semibold text-ink" data-testid="accepted-count">{accepted}</b> из {changes.length}</p>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" onClick={() => patch({ all: 'accepted' })}>Принять все</Button>
          <Button variant="secondary" size="sm" onClick={() => patch({ all: 'rejected' })}>Отклонить все</Button>
          <a href={`/api/adaptations/${id}/pdf`} download data-testid="download-pdf" className={buttonClass({ size: 'sm' })}><Icon name="download" size={14} />Скачать PDF</a>
        </div>
      </div>
      {error && <Alert>{error}</Alert>}

      <section aria-labelledby="chg">
        <h2 id="chg" className="mb-3 text-lg font-semibold tracking-tight">Предлагаемые изменения</h2>
        <ul className="space-y-3">
          {changes.map((c) => (
            <li key={c.id}><Card className={c.status === 'rejected' ? 'opacity-60' : ''}>
              <div className="mb-3.5 flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-1.5"><span className="text-[13px] font-medium text-accent-600">{c.section}</span>
                  {c.status === 'accepted' && <span className="inline-flex items-center gap-1 rounded-md bg-ink px-2 py-0.5 text-xs font-medium text-milk"><Icon name="check" size={12} strokeWidth={2.4} />Принято</span>}
                  {c.status === 'rejected' && <Badge>Отклонено</Badge>}
                  {c.edited && <Badge>Отредактировано</Badge>}</div>
                <div className="flex gap-1.5">
                  <Button size="sm" variant={c.status === 'accepted' ? 'primary' : 'secondary'} onClick={() => patch({ changeId: c.id, status: 'accepted' })}>Принять</Button>
                  <Button size="sm" variant="secondary" onClick={() => patch({ changeId: c.id, status: 'rejected' })}>Отклонить</Button>
                  <Button size="sm" variant="ghost" onClick={() => { setEditing(c.id); setDraft(eff(c)); }} aria-label="Редактировать"><Icon name="edit" size={14} /><span className="hidden sm:inline">Редактировать</span></Button>
                </div>
              </div>
              {editing === c.id ? (
                <div>
                  <textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={Math.min(8, draft.split('\n').length + 1)} aria-label="Редактирование текста"
                    className="w-full rounded-lg border border-line-strong p-3 text-sm leading-relaxed outline-none focus:border-accent-500 focus:shadow-[0_0_0_3px_var(--color-accent-100)]" />
                  <div className="mt-2.5 flex flex-wrap gap-2">
                    <Button size="sm" onClick={async () => { await patch({ changeId: c.id, edited: draft, status: 'accepted' }); setEditing(null); }}>Сохранить и принять</Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>Отмена</Button>
                    {c.edited && <Button size="sm" variant="ghost" onClick={async () => { await patch({ changeId: c.id, edited: null }); setEditing(null); }}>Вернуть предложение</Button>}
                  </div>
                  <p className="mt-2 text-xs text-muted">Добавляйте только то, что соответствует вашему реальному опыту.</p>
                </div>
              ) : (
                <div className="user-text whitespace-pre-wrap rounded-lg bg-canvas px-3.5 py-3 text-sm leading-relaxed">
                  {c.kind === 'insert' ? <span className="diff-ins">{eff(c)}</span> : <Diff a={c.original} b={eff(c)} side="both" />}
                </div>
              )}
              <p className="mt-3 text-[13px] text-muted">{c.reason}</p>
            </Card></li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="cmp">
        <h2 id="cmp" className="mb-3 text-lg font-semibold tracking-tight">Сравнение версий</h2>
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="sm:p-5">
            <div className="mb-3 text-sm font-medium">Исходное резюме</div>
            <div className="user-text max-h-[32rem] overflow-auto text-[13px] leading-relaxed text-ink-2" data-testid="original-resume">
              {origLines.map((l, i) => {
                const rep = changes.find((c) => c.kind === 'replace' && c.lineIndex === i && c.status === 'accepted');
                return <div key={i} className="min-h-[1.2em] whitespace-pre-wrap">{rep ? <Diff a={l} b={eff(rep)} side="del" /> : l}</div>;
              })}
            </div>
          </Card>
          <Card className="sm:p-5">
            <div className="mb-3 text-sm font-medium">Адаптированное резюме <span className="font-normal text-muted">· «{vacancyTitle}»</span></div>
            <div className="user-text max-h-[32rem] overflow-auto text-[13px] leading-relaxed text-ink-2" data-testid="adapted-resume">
              {side.map((r, i) => <div key={i} className="min-h-[1.2em] whitespace-pre-wrap">{r.orig !== undefined ? <Diff a={r.orig} b={r.text} side="ins" /> : r.changed ? <span className="diff-ins">{r.text}</span> : r.text}</div>)}
            </div>
          </Card>
        </div>
        <p className="mt-3 text-xs text-muted">Зелёным отмечены добавленные формулировки, красным — заменённые. Факты, цифры и названия в правках не меняются.{engine === 'llm' ? '' : ' Правки подготовлены встроенным движком; с подключённым AI их будет больше.'}</p>
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-6">
        <span className="text-sm text-ink-2">Резюме готово — осталось письмо.</span>
        <Link href={`/cover-letter?vacancy=${vacancyId}`} className={buttonClass({ size: 'lg' })}>Создать сопроводительное письмо<Icon name="arrow-right" size={16} /></Link>
      </div>
      <textarea hidden readOnly value={finalText} data-testid="final-text" />
    </div>
  );
}
