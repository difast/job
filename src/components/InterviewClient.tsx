'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { INTERVIEW_TYPE_LABELS, type AnswerFeedback, type InterviewType } from '@/lib/types';
import Icon from './Icon';
import { Alert, Button, ScoreRing, Segmented, Skeleton, Spinner, cx, scoreVerdict } from './ui';
import { request } from '@/lib/client';
import { useConfirm } from './Confirm';

interface Q { id: string; text: string; category: string; difficulty: number; sampleAnswer: string; keyPoints: string[]; lastScore: number | null }
const DIFF: Record<number, string> = { 1: 'Базовый', 2: 'Средний', 3: 'Сложный' };

function Difficulty({ level }: { level: number }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[13px] text-ink-2" title={`Сложность: ${DIFF[level]}`}>
      <span className="flex items-end gap-[2px]" aria-hidden="true">{[1, 2, 3].map((i) => <span key={i} className={cx('w-[3px] rounded-sm', i <= level ? 'bg-ink' : 'bg-line-strong')} style={{ height: 4 + i * 3 }} />)}</span>
      {DIFF[level]}
    </span>
  );
}

export default function InterviewClient() {
  const [type, setType] = useState<InterviewType>('hr');
  const [qs, setQs] = useState<Q[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [i, setI] = useState(0);
  const [answer, setAnswer] = useState('');
  const [fb, setFb] = useState<AnswerFeedback | null>(null);
  const [scores, setScores] = useState<number[]>([]);
  const [hint, setHint] = useState<'points' | 'sample' | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const field = useRef<HTMLTextAreaElement>(null);
  const confirm = useConfirm();
  const unsent = !fb && answer.trim().length > 0;

  const reset = () => { setAnswer(''); setFb(null); setHint(null); setError(''); };
  const load = useCallback((t: InterviewType) => {
    setQs(null); setLoadError(false); setI(0); setScores([]); setDone(false); setAnswer(''); setFb(null); setHint(null); setError('');
    request<{ questions: Q[] }>(`/api/interview/questions?type=${t}`, { timeoutMs: 30_000 }).then((r) => (r.ok ? setQs(r.data.questions ?? []) : setLoadError(true)));
  }, []);

  // Неотправленный ответ не теряется молча при закрытии вкладки
  useEffect(() => {
    if (!unsent) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [unsent]);

  async function changeType(t: InterviewType) {
    if (t === type || busy) return;
    if ((unsent || (scores.length > 0 && !done)) && !(await confirm({ title: 'Сменить тип собеседования?', text: 'Текущая тренировка будет сброшена: прогресс и неотправленный ответ не сохранятся. Оценки уже отправленных ответов останутся в истории.', confirm: 'Сменить тип' }))) return;
    setType(t);
  }
  useEffect(() => { load(type); }, [type, load]);

  const q = qs?.[i];
  const total = qs?.length ?? 0;
  const avg = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
  const words = answer.trim() ? answer.trim().split(/\s+/).length : 0;

  async function submit() {
    if (!q || busy || answer.trim().length < 3) return;
    setBusy(true); setError('');
    const r = await request<{ feedback: AnswerFeedback }>('/api/interview/answer', { method: 'POST', json: { questionId: q.id, answer }, timeoutMs: 90_000 });
    setBusy(false);
    if (!r.ok) { setError(`${r.error} Ваш ответ сохранён в поле — можно отправить ещё раз.`); return; }
    setFb(r.data.feedback); setScores((s) => [...s, r.data.feedback.score]); setHint(null);
  }

  async function skip() {
    if (answer.trim().length > 20 && !(await confirm({ title: 'Пропустить вопрос?', text: 'Написанный ответ не будет отправлен на разбор и пропадёт.', confirm: 'Пропустить' }))) return;
    next();
  }

  function next() {
    if (!qs) return;
    if (i + 1 >= qs.length) { setDone(true); return; }
    setI(i + 1); reset();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    setTimeout(() => field.current?.focus({ preventScroll: true }), 300);
  }

  return (
    <div className="mx-auto max-w-[820px] space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented label="Тип собеседования" value={type} onChange={changeType} options={(Object.keys(INTERVIEW_TYPE_LABELS) as InterviewType[]).map((t) => ({ value: t, label: INTERVIEW_TYPE_LABELS[t] }))} />
        {scores.length > 0 && !done && <span className="text-sm text-ink-2">Средний балл: <b className="tabular font-semibold text-ink">{avg}</b></span>}
      </div>

      {loadError && <Alert>Не удалось загрузить вопросы. <button className="font-medium underline" onClick={() => load(type)}>Повторить</button></Alert>}
      {qs === null && !loadError && <div className="rounded-2xl border border-line bg-white p-8"><Skeleton className="mb-4 h-4 w-32" /><Skeleton className="mb-6 h-7 w-4/5" /><Skeleton className="h-40 w-full" /></div>}
      {qs?.length === 0 && <div className="rounded-2xl border border-line bg-white p-8 text-sm text-ink-2">Для этого сочетания пока нет вопросов — база регулярно пополняется. Попробуйте другой тип собеседования.</div>}

      {done && qs && (
        <section className="rounded-2xl border border-line bg-white px-6 py-10 text-center">
          <div className="mx-auto flex max-w-sm flex-col items-center">
            <ScoreRing value={avg} size={124} stroke={8} suffix="средний балл" />
            <h2 className="mt-5 text-[24px] font-semibold tracking-[-0.02em]">Тренировка завершена</h2>
            <p className="mt-2 text-[15px] text-ink-2">Вы ответили на {scores.length} из {total} вопросов. {avg >= 70 ? 'Отличный результат!' : 'Повторите вопросы с низким баллом — в этом смысл тренировки.'}</p>
            <Button size="lg" className="mt-7" onClick={() => load(type)}><Icon name="refresh" size={16} />Пройти ещё раз</Button>
          </div>
        </section>
      )}

      {q && !done && (
        <section key={q.id} className="fade-in rounded-2xl border border-line bg-white" aria-label={`Вопрос ${i + 1} из ${total}`}>
          {/* прогресс */}
          <div className="h-1 overflow-hidden rounded-t-2xl bg-subtle" role="progressbar" aria-valuenow={i + (fb ? 1 : 0)} aria-valuemin={0} aria-valuemax={total} aria-label="Прогресс тренировки">
            <div className="h-full bg-accent-500 transition-[width] duration-500" style={{ width: `${((i + (fb ? 1 : 0)) / total) * 100}%` }} />
          </div>
          <div className="px-6 pb-7 pt-6 sm:px-9 sm:pt-8">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[13px]">
              <span className="font-medium text-ink">Вопрос <span className="tabular">{i + 1}</span> из <span className="tabular">{total}</span></span>
              <span className="text-muted">{q.category}</span>
              <Difficulty level={q.difficulty} />
              {q.lastScore !== null && <span className="text-muted">Прошлый результат: <span className="tabular text-ink">{q.lastScore}</span></span>}
            </div>
            <h2 className="mt-4 text-[24px] font-semibold leading-[1.25] tracking-[-0.02em] sm:text-[28px]" data-testid="question-text">{q.text}</h2>

            {/* подсказки доступны до ответа, но свёрнуты, чтобы не мешать */}
            <div className="mt-5 flex flex-wrap gap-2">
              {(['points', 'sample'] as const).map((h) => (
                <button key={h} type="button" onClick={() => setHint(hint === h ? null : h)} aria-expanded={hint === h}
                  className={cx('inline-flex h-8 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-medium transition-colors', hint === h ? 'bg-ink text-milk' : 'bg-stone text-ink-2 hover:text-ink')}>
                  <Icon name={h === 'points' ? 'list' : 'file'} size={14} />{h === 'points' ? 'Что раскрыть в ответе' : 'Пример сильного ответа'}
                </button>
              ))}
            </div>
            {hint && (
              <div className="fade-in mt-3 rounded-xl bg-canvas px-5 py-4 text-[14.5px] leading-relaxed" data-testid="hint">
                {hint === 'points'
                  ? <ul className="space-y-1.5">{q.keyPoints.map((k) => <li key={k} className="flex gap-2.5"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-accent-500" />{k}</li>)}</ul>
                  : <p>{q.sampleAnswer}</p>}
              </div>
            )}

            {!fb ? (
              <div className="mt-6">
                <label htmlFor="answer" className="mb-2 block text-sm font-medium">Ваш ответ</label>
                <textarea id="answer" ref={field} value={answer} onChange={(e) => setAnswer(e.target.value)} rows={8} disabled={busy}
                  onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit(); }}
                  placeholder="Ответьте так, как ответили бы на собеседовании: 1–2 минуты, с примером из своего опыта и результатом…"
                  className="w-full resize-y rounded-xl border border-line-strong bg-white p-4 text-[15px] leading-relaxed outline-none transition-shadow placeholder:text-muted focus:border-accent-500 focus:shadow-[0_0_0_3px_var(--color-accent-100)] disabled:bg-subtle" />
                {error && <Alert className="mt-3">{error}</Alert>}
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-4 text-[13px] text-muted">
                    <span className="tabular">{words} {words % 10 === 1 && words % 100 !== 11 ? 'слово' : 'слов'}{words > 0 && words < 40 ? ' · лучше 40–150' : ''}</span>
                    <button type="button" onClick={skip} disabled={busy} className="font-medium text-ink-2 transition-colors hover:text-ink">Пропустить</button>
                  </div>
                  <div className="flex items-center gap-3"><span className="hidden text-xs text-muted sm:inline">Ctrl + Enter</span>
                    <Button size="lg" onClick={submit} disabled={busy || answer.trim().length < 3}>{busy ? <><Spinner />Разбираем ответ…</> : 'Ответить'}</Button></div>
                </div>
              </div>
            ) : (
              <div className="mt-7 border-t border-line pt-7" data-testid="feedback">
                <div className="flex flex-col gap-6 sm:flex-row sm:gap-9">
                  <div className="flex shrink-0 items-center gap-4 self-start sm:block sm:text-center">
                    <ScoreRing value={fb.score} size={104} stroke={7} suffix="балл" />
                    <div className="text-sm font-medium sm:mt-2">{scoreVerdict(fb.score)}</div>
                  </div>
                  <div className="grid min-w-0 flex-1 gap-6">
                    <div>
                      <h3 className="font-sans text-sm font-semibold" style={{ letterSpacing: 0 }}>Что хорошо</h3>
                      {fb.covered.length ? <ul className="mt-2 space-y-1.5 text-[14.5px]">{fb.covered.map((c) => <li key={c} className="flex gap-2.5"><Icon name="check" size={16} strokeWidth={2.2} className="mt-0.5 shrink-0 text-ink" />{c}</li>)}</ul> : <p className="mt-2 text-sm text-muted">Пока ни один ключевой пункт не раскрыт полностью.</p>}
                    </div>
                    {fb.missed.length > 0 && (
                      <div>
                        <h3 className="font-sans text-sm font-semibold" style={{ letterSpacing: 0 }}>Что улучшить</h3>
                        <ul className="mt-2 space-y-1.5 text-[14.5px]">{fb.missed.map((c) => <li key={c} className="flex gap-2.5"><Icon name="alert" size={16} className="mt-0.5 shrink-0 text-accent-600" />{c}</li>)}</ul>
                      </div>
                    )}
                    <div>
                      <h3 className="font-sans text-sm font-semibold" style={{ letterSpacing: 0 }}>Как усилить ответ</h3>
                      <ul className="mt-2 space-y-1.5 text-[14.5px]">{fb.tips.map((t) => <li key={t} className="flex gap-2.5"><Icon name="chevron-right" size={16} className="mt-0.5 shrink-0 text-accent-600" />{t}</li>)}</ul>
                    </div>
                  </div>
                </div>
                <details className="group mt-6 rounded-xl bg-canvas px-5 py-3.5">
                  <summary className="flex cursor-pointer list-none items-center gap-1.5 text-sm font-medium text-ink-2 hover:text-ink"><Icon name="chevron-right" size={14} className="transition-transform group-open:rotate-90" />Ваш ответ</summary>
                  <p className="mt-2.5 user-text whitespace-pre-wrap text-sm leading-relaxed text-ink-2">{answer}</p>
                </details>
                <div className="mt-6 flex flex-wrap justify-end gap-2">
                  <Button size="lg" variant="secondary" onClick={() => { setFb(null); setScores((s) => s.slice(0, -1)); }}>Ответить ещё раз</Button>
                  <Button size="lg" onClick={next}>{i + 1 >= total ? 'Завершить' : 'Следующий вопрос'}<Icon name="arrow-right" size={16} /></Button>
                </div>
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
