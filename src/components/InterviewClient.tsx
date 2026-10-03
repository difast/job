'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { INTERVIEW_TYPE_LABELS, type AnswerFeedback, type InterviewType } from '@/lib/types';
import Icon from './Icon';
import { Alert, Badge, Button, Card, ScoreRing, Segmented, Skeleton, Spinner } from './ui';

interface Q { id: string; text: string; category: string; difficulty: number; sampleAnswer: string; keyPoints: string[]; lastScore: number | null }
const DIFF: Record<number, { label: string; tone: 'ok' | 'warn' | 'bad' }> = { 1: { label: 'Лёгкий', tone: 'ok' }, 2: { label: 'Средний', tone: 'warn' }, 3: { label: 'Сложный', tone: 'bad' } };

export default function InterviewClient() {
  const [type, setType] = useState<InterviewType>('hr');
  const [qs, setQs] = useState<Q[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [i, setI] = useState(0);
  const [answer, setAnswer] = useState('');
  const [fb, setFb] = useState<AnswerFeedback | null>(null);
  const [scores, setScores] = useState<number[]>([]);
  const [showSample, setShowSample] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const field = useRef<HTMLTextAreaElement>(null);

  const load = useCallback((t: InterviewType) => {
    setQs(null); setLoadError(false); setI(0); setAnswer(''); setFb(null); setScores([]); setDone(false); setError(''); setShowSample(false);
    fetch(`/api/interview/questions?type=${t}`).then(async (r) => { if (!r.ok) throw new Error(); setQs((await r.json()).questions ?? []); }).catch(() => setLoadError(true));
  }, []);
  useEffect(() => { load(type); }, [type, load]);

  const q = qs?.[i];

  async function submit() {
    if (!q || busy || answer.trim().length < 3) return;
    setBusy(true); setError('');
    try {
      const r = await fetch('/api/interview/answer', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ questionId: q.id, answer }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setError(d.error ?? 'Не удалось оценить ответ. Попробуйте ещё раз.'); setBusy(false); return; }
      setFb(d.feedback); setScores((s) => [...s, d.feedback.score]);
    } catch { setError('Нет соединения с сервером. Ответ не отправлен.'); }
    setBusy(false);
  }

  function next() {
    if (!qs) return;
    if (i + 1 >= qs.length) { setDone(true); return; }
    setI(i + 1); setAnswer(''); setFb(null); setShowSample(false); setError('');
    setTimeout(() => field.current?.focus(), 50);
  }

  const total = qs?.length ?? 0;
  const avg = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;

  return (
    <div className="space-y-6">
      <Segmented label="Тип собеседования" value={type} onChange={setType} options={(Object.keys(INTERVIEW_TYPE_LABELS) as InterviewType[]).map((t) => ({ value: t, label: INTERVIEW_TYPE_LABELS[t] }))} />

      {loadError && <Alert>Не удалось загрузить вопросы. <button className="font-medium underline" onClick={() => load(type)}>Повторить</button></Alert>}
      {qs === null && !loadError && <Card><Skeleton className="mb-4 h-4 w-32" /><Skeleton className="mb-3 h-6 w-4/5" /><Skeleton className="h-32 w-full" /></Card>}
      {qs?.length === 0 && <Card><p className="text-sm text-ink-2">Для этого сочетания пока нет вопросов — база регулярно пополняется. Попробуйте другой тип собеседования.</p></Card>}

      {done && qs && (
        <Card className="text-center sm:py-10">
          <div className="mx-auto flex max-w-sm flex-col items-center">
            <ScoreRing value={avg} size={120} stroke={8} suffix="средний балл" />
            <h2 className="mt-5 text-xl font-semibold tracking-tight">Тренировка завершена</h2>
            <p className="mt-1.5 text-sm text-ink-2">Вы ответили на {scores.length} из {total} вопросов.{avg >= 70 ? ' Отличный результат!' : ' Повторите вопросы с низкими баллами — в этом и смысл тренировки.'}</p>
            <div className="mt-6 flex flex-wrap justify-center gap-2.5"><Button size="lg" onClick={() => load(type)}><Icon name="refresh" size={16} />Пройти ещё раз</Button></div>
          </div>
        </Card>
      )}

      {q && !done && (
        <>
          <div>
            <div className="mb-2 flex items-center justify-between text-[13px]"><span className="font-medium">Вопрос <span className="tabular">{i + 1}</span> из <span className="tabular">{total}</span></span>
              {scores.length > 0 && <span className="text-muted">Средний балл: <span className="tabular font-medium text-ink">{avg}</span></span>}</div>
            <div className="h-1 overflow-hidden rounded-full bg-[#e8eaf0]" role="progressbar" aria-valuenow={i + (fb ? 1 : 0)} aria-valuemin={0} aria-valuemax={total} aria-label="Прогресс тренировки"><div className="h-full rounded-full bg-accent-600 transition-[width] duration-500" style={{ width: `${((i + (fb ? 1 : 0)) / total) * 100}%` }} /></div>
          </div>

          <Card key={q.id} className="fade-in sm:p-8">
            <div className="mb-4 flex flex-wrap items-center gap-1.5"><Badge>{q.category}</Badge><Badge tone={DIFF[q.difficulty].tone}>{DIFF[q.difficulty].label}</Badge>{q.lastScore !== null && <Badge tone="accent">Прошлый результат: {q.lastScore}</Badge>}</div>
            <h2 className="text-[22px] font-semibold leading-snug tracking-tight" data-testid="question-text">{q.text}</h2>

            {!fb ? (
              <div className="mt-6">
                <label htmlFor="answer" className="sr-only">Ваш ответ</label>
                <textarea id="answer" ref={field} value={answer} onChange={(e) => setAnswer(e.target.value)} rows={7} disabled={busy}
                  onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit(); }}
                  placeholder="Ответьте так, как ответили бы на собеседовании: 1–2 минуты, с примером из опыта…"
                  className="w-full resize-y rounded-lg border border-line-strong bg-white p-4 text-[15px] leading-relaxed outline-none transition-shadow placeholder:text-muted focus:border-accent-500 focus:shadow-[0_0_0_3px_var(--color-accent-100)] disabled:bg-subtle" />
                {error && <Alert className="mt-3">{error}</Alert>}
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                  <button type="button" onClick={next} className="text-sm text-muted transition-colors hover:text-ink">Пропустить вопрос</button>
                  <div className="flex items-center gap-3"><span className="hidden text-xs text-muted sm:inline">Ctrl + Enter</span>
                    <Button size="lg" onClick={submit} disabled={busy || answer.trim().length < 3}>{busy ? <><Spinner />Разбираем ответ…</> : 'Ответить'}</Button></div>
                </div>
              </div>
            ) : (
              <div className="mt-6 space-y-6" data-testid="feedback">
                <div className="rounded-lg bg-canvas p-4 text-sm leading-relaxed text-ink-2"><div className="mb-1 text-xs font-medium uppercase tracking-wider text-muted">Ваш ответ</div><p className="whitespace-pre-wrap">{answer}</p></div>
                <div className="flex flex-col gap-6 sm:flex-row sm:gap-8">
                  <div className="shrink-0 self-start"><ScoreRing value={fb.score} size={104} stroke={7} suffix="балл" /></div>
                  <div className="grid flex-1 gap-5">
                    <div>
                      <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold"><span className="flex h-5 w-5 items-center justify-center rounded-full bg-ok-soft text-ok"><Icon name="check" size={12} strokeWidth={2.6} /></span>Что хорошо</h3>
                      {fb.covered.length ? <ul className="space-y-1.5 text-sm">{fb.covered.map((c) => <li key={c} className="flex gap-2"><Icon name="check" size={15} className="mt-0.5 shrink-0 text-ok" />{c}</li>)}</ul> : <p className="text-sm text-muted">Пока ни один ключевой пункт не раскрыт полностью.</p>}
                    </div>
                    {fb.missed.length > 0 && (
                      <div>
                        <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold"><span className="flex h-5 w-5 items-center justify-center rounded-full bg-warn-soft text-warn"><Icon name="alert" size={11} strokeWidth={2.4} /></span>Что улучшить</h3>
                        <ul className="space-y-1.5 text-sm">{fb.missed.map((c) => <li key={c} className="flex gap-2"><Icon name="chevron-right" size={15} className="mt-0.5 shrink-0 text-warn" />{c}</li>)}</ul>
                      </div>
                    )}
                    <div>
                      <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold"><span className="flex h-5 w-5 items-center justify-center rounded-full bg-accent-50 text-accent-600"><Icon name="trend" size={12} strokeWidth={2.2} /></span>Как усилить ответ</h3>
                      <ul className="space-y-1.5 text-sm">{fb.tips.map((t) => <li key={t} className="flex gap-2"><Icon name="chevron-right" size={15} className="mt-0.5 shrink-0 text-accent-600" />{t}</li>)}</ul>
                    </div>
                  </div>
                </div>
                <div className="border-t border-line pt-4">
                  <button onClick={() => setShowSample(!showSample)} aria-expanded={showSample} className="inline-flex items-center gap-1.5 text-sm font-medium text-accent-600 hover:underline"><Icon name="chevron-right" size={14} className={`transition-transform ${showSample ? 'rotate-90' : ''}`} />Пример сильного ответа</button>
                  {showSample && <div className="fade-in mt-3 rounded-lg bg-accent-50 p-4 text-sm leading-relaxed">{q.sampleAnswer}</div>}
                </div>
                <div className="flex justify-end"><Button size="lg" onClick={next}>{i + 1 >= total ? 'Завершить' : 'Следующий вопрос'}<Icon name="arrow-right" size={16} /></Button></div>
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
