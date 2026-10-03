'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { applyChanges, diffWords } from '@/lib/changes';
import type { Change } from '@/lib/types';
import { Badge, Button, Card, EmptyState } from './ui';

function Diff({ a, b, side }: { a: string; b: string; side: 'del' | 'ins' | 'both' }) {
  const parts = diffWords(a, b);
  return (
    <span>
      {parts.map((p, i) => p.type === 'same' ? <span key={i}>{p.text}</span>
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

  async function patch(body: object) {
    setError('');
    const r = await fetch(`/api/adaptations/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { setError(d.error ?? 'Не удалось сохранить'); return; }
    setChanges(d.changes);
  }

  const origLines = original.replace(/\r/g, '').split('\n');
  const side = useMemo(() => {
    // правая колонка: строки с учётом всех принятых правок, подсветка изменённых
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
    return <EmptyState title="Правок не потребовалось" text="Мы не нашли безопасных улучшений формулировок: резюме уже хорошо подходит под вакансию, а выдумывать факты мы не будем. Вы можете скачать исходную версию." action={<a href={`/api/adaptations/${id}/pdf`} className="inline-flex h-10 items-center rounded-lg bg-accent-600 px-4 text-sm font-medium text-white hover:bg-accent-700">Скачать PDF</a>} />;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">Принято правок: <b className="text-ink" data-testid="accepted-count">{accepted}</b> из {changes.length}</p>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" onClick={() => patch({ all: 'accepted' })}>Принять все</Button>
          <Button variant="secondary" size="sm" onClick={() => patch({ all: 'rejected' })}>Отклонить все</Button>
          <a href={`/api/adaptations/${id}/pdf`} download data-testid="download-pdf" className="inline-flex h-8 items-center rounded-lg bg-accent-600 px-3 text-sm font-medium text-white hover:bg-accent-700">Скачать PDF</a>
        </div>
      </div>
      {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-muted">Предлагаемые изменения</h2>
        {changes.map((c) => (
          <Card key={c.id} className={c.status === 'rejected' ? 'opacity-60' : ''}>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2"><Badge tone="accent">{c.section}</Badge>
                {c.status === 'accepted' && <Badge tone="green">Принято</Badge>}{c.status === 'rejected' && <Badge>Отклонено</Badge>}{c.edited && <Badge tone="amber">Отредактировано</Badge>}</div>
              <div className="flex gap-1.5">
                <Button size="sm" variant={c.status === 'accepted' ? 'primary' : 'secondary'} onClick={() => patch({ changeId: c.id, status: 'accepted' })}>Принять</Button>
                <Button size="sm" variant="secondary" onClick={() => patch({ changeId: c.id, status: 'rejected' })}>Отклонить</Button>
                <Button size="sm" variant="ghost" onClick={() => { setEditing(c.id); setDraft(eff(c)); }}>Редактировать</Button>
              </div>
            </div>
            {editing === c.id ? (
              <div>
                <textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={Math.min(8, draft.split('\n').length + 1)} aria-label="Редактирование текста"
                  className="w-full rounded-lg border border-line p-3 text-sm outline-none focus:border-accent-500 focus:ring-2 focus:ring-accent-100" />
                <div className="mt-2 flex gap-2">
                  <Button size="sm" onClick={async () => { await patch({ changeId: c.id, edited: draft, status: 'accepted' }); setEditing(null); }}>Сохранить и принять</Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>Отмена</Button>
                  {c.edited && <Button size="sm" variant="ghost" onClick={async () => { await patch({ changeId: c.id, edited: null }); setEditing(null); }}>Вернуть предложение</Button>}
                </div>
                <p className="mt-2 text-xs text-muted">Добавляйте только то, что соответствует вашему реальному опыту.</p>
              </div>
            ) : (
              <div className="whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-sm leading-relaxed">
                {c.kind === 'insert' ? <span className="diff-ins">{eff(c)}</span> : <Diff a={c.original} b={eff(c)} side="both" />}
              </div>
            )}
            <p className="mt-2 text-xs text-muted">{c.reason}</p>
          </Card>
        ))}
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-muted">Сравнение версий</h2>
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <div className="mb-3 text-sm font-medium">Исходное резюме</div>
            <div className="max-h-[32rem] overflow-auto text-sm leading-relaxed" data-testid="original-resume">
              {origLines.map((l, i) => {
                const rep = changes.find((c) => c.kind === 'replace' && c.lineIndex === i && c.status === 'accepted');
                return <div key={i} className="min-h-[1.25em] whitespace-pre-wrap">{rep ? <Diff a={l} b={eff(rep)} side="del" /> : l}</div>;
              })}
            </div>
          </Card>
          <Card>
            <div className="mb-3 text-sm font-medium">Адаптированное резюме <span className="font-normal text-muted">· под «{vacancyTitle}»</span></div>
            <div className="max-h-[32rem] overflow-auto text-sm leading-relaxed" data-testid="adapted-resume">
              {side.map((r, i) => <div key={i} className="min-h-[1.25em] whitespace-pre-wrap">{r.orig !== undefined ? <Diff a={r.orig} b={r.text} side="ins" /> : r.changed ? <span className="diff-ins">{r.text}</span> : r.text}</div>)}
            </div>
          </Card>
        </div>
        <p className="mt-3 text-xs text-muted">Зелёным отмечены добавленные формулировки, красным — заменённые. Факты, цифры и названия в правках не меняются. {engine === 'llm' ? '' : 'Правки подготовлены встроенным движком; с AI-ключом их станет больше.'}</p>
        <div className="mt-5"><Link href={`/cover-letter?vacancy=${vacancyId}`} className="text-sm font-medium text-accent-600 hover:underline">Далее: сопроводительное письмо →</Link></div>
      </section>
      <textarea hidden readOnly value={finalText} data-testid="final-text" />
    </div>
  );
}
