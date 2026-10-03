'use client';
import { useEffect, useState } from 'react';
import { INTERVIEW_TYPE_LABELS, type AnswerFeedback, type InterviewType } from '@/lib/types';
import { Badge, Button, Card, ScoreRing, Spinner, cx } from './ui';

interface Q { id: string; text: string; category: string; difficulty: number; sampleAnswer: string; keyPoints: string[]; lastScore: number | null }
const DIFF = ['', 'Лёгкий', 'Средний', 'Сложный'];

export default function InterviewClient({ professionName, levelLabel }: { professionName: string; levelLabel: string }) {
  const [type, setType] = useState<InterviewType>('hr');
  const [qs, setQs] = useState<Q[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [answer, setAnswer] = useState('');
  const [fb, setFb] = useState<AnswerFeedback | null>(null);
  const [showSample, setShowSample] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setQs(null); setOpen(null);
    fetch(`/api/interview/questions?type=${type}`).then((r) => r.json()).then((d) => setQs(d.questions ?? []));
  }, [type]);

  function pick(id: string) { setOpen(open === id ? null : id); setAnswer(''); setFb(null); setShowSample(false); setError(''); }

  async function submit(q: Q) {
    setBusy(true); setError('');
    const r = await fetch('/api/interview/answer', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ questionId: q.id, answer }) });
    const d = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) { setError(d.error ?? 'Не удалось оценить ответ'); return; }
    setFb(d.feedback);
    setQs((list) => list?.map((x) => (x.id === q.id ? { ...x, lastScore: d.feedback.score } : x)) ?? null);
  }

  return (
    <div>
      <Card className="mb-5">
        <div className="grid gap-4 sm:grid-cols-3">
          <div><div className="text-xs font-medium uppercase tracking-wider text-muted">Профессия</div><div className="mt-1 text-sm font-medium">{professionName}</div></div>
          <div><div className="text-xs font-medium uppercase tracking-wider text-muted">Уровень</div><div className="mt-1 text-sm font-medium">{levelLabel}</div></div>
          <div>
            <div className="text-xs font-medium uppercase tracking-wider text-muted">Тип собеседования</div>
            <div className="mt-1.5 flex gap-1 rounded-lg bg-slate-100 p-1" role="tablist">
              {(Object.keys(INTERVIEW_TYPE_LABELS) as InterviewType[]).map((t) => (
                <button key={t} role="tab" aria-selected={type === t} onClick={() => setType(t)}
                  className={cx('flex-1 rounded-md px-2 py-1 text-xs font-medium transition', type === t ? 'bg-white shadow-sm' : 'text-muted hover:text-ink')}>{INTERVIEW_TYPE_LABELS[t]}</button>
              ))}
            </div>
          </div>
        </div>
      </Card>

      <h2 className="mb-3 text-sm font-semibold text-muted">{professionName} → {levelLabel} → {INTERVIEW_TYPE_LABELS[type]}{qs ? ` · ${qs.length} вопросов` : ''}</h2>
      {qs === null && <p className="text-sm text-muted">Загрузка вопросов…</p>}
      {qs?.length === 0 && <Card><p className="text-sm text-muted">Для этого сочетания пока нет вопросов — база регулярно пополняется. Попробуйте другой тип собеседования.</p></Card>}
      <div className="space-y-2">
        {qs?.map((q) => (
          <Card key={q.id} className="p-0">
            <button onClick={() => pick(q.id)} aria-expanded={open === q.id} className="flex w-full items-start justify-between gap-4 p-4 text-left">
              <div>
                <div className="text-sm font-medium">{q.text}</div>
                <div className="mt-1.5 flex flex-wrap items-center gap-2"><Badge>{q.category}</Badge><Badge tone={q.difficulty === 3 ? 'red' : q.difficulty === 2 ? 'amber' : 'green'}>{DIFF[q.difficulty]}</Badge>
                  {q.lastScore !== null && <Badge tone="accent">Лучший последний результат: {q.lastScore}</Badge>}</div>
              </div>
              <span className="mt-1 text-muted">{open === q.id ? '▴' : '▾'}</span>
            </button>
            {open === q.id && (
              <div className="space-y-4 border-t border-line p-4">
                <div>
                  <div className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted">Ключевые пункты хорошего ответа</div>
                  <ul className="space-y-1 text-sm">{q.keyPoints.map((k) => <li key={k} className="flex gap-2"><span className="text-accent-500">•</span>{k}</li>)}</ul>
                </div>
                <div>
                  <button onClick={() => setShowSample(!showSample)} className="text-sm font-medium text-accent-600 hover:underline">{showSample ? 'Скрыть' : 'Показать'} пример сильного ответа</button>
                  {showSample && <p className="mt-2 rounded-lg bg-accent-50 p-3 text-sm leading-relaxed">{q.sampleAnswer}</p>}
                </div>
                <div>
                  <label htmlFor={`a-${q.id}`} className="mb-1.5 block text-sm font-medium">Ваш ответ (тренажёр)</label>
                  <textarea id={`a-${q.id}`} value={answer} onChange={(e) => setAnswer(e.target.value)} rows={6} placeholder="Ответьте так, как ответили бы на собеседовании…"
                    className="w-full rounded-lg border border-line p-3 text-sm outline-none focus:border-accent-500 focus:ring-2 focus:ring-accent-100" />
                  {error && <p role="alert" className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
                  <div className="mt-3"><Button onClick={() => submit(q)} disabled={busy || answer.trim().length < 3}>{busy && <Spinner />}Получить обратную связь</Button></div>
                </div>
                {fb && (
                  <div className="rounded-xl border border-line bg-slate-50 p-4" data-testid="feedback">
                    <div className="flex flex-col gap-5 sm:flex-row">
                      <ScoreRing value={fb.score} size={96} suffix="" />
                      <div className="flex-1 space-y-3 text-sm">
                        {fb.covered.length > 0 && <div><div className="mb-1 font-medium text-emerald-700">Раскрыто</div><ul className="space-y-0.5">{fb.covered.map((c) => <li key={c}>✓ {c}</li>)}</ul></div>}
                        {fb.missed.length > 0 && <div><div className="mb-1 font-medium text-amber-700">Не хватило</div><ul className="space-y-0.5">{fb.missed.map((c) => <li key={c}>○ {c}</li>)}</ul></div>}
                        <div><div className="mb-1 font-medium">Как улучшить</div><ul className="space-y-0.5">{fb.tips.map((t) => <li key={t}>→ {t}</li>)}</ul></div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}
