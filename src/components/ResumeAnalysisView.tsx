import Icon from './Icon';
import { EngineNote, Meter, ScoreRing, scoreVerdict } from './ui';
import type { ResumeAnalysis } from '@/lib/types';

export const BREAKDOWN: [keyof ResumeAnalysis['breakdown'], string][] = [
  ['structure', 'Структура'], ['experience', 'Опыт'], ['achievements', 'Достижения'], ['skills', 'Навыки'], ['fit', 'Соответствие профессии'], ['ats', 'ATS'],
];

const SectionTitle = ({ id, children, count }: { id: string; children: React.ReactNode; count?: number }) => (
  <h2 id={id} className="flex items-baseline gap-2 text-[19px] font-semibold tracking-[-0.015em]">{children}{count !== undefined && <span className="tabular font-sans text-sm font-normal text-muted">{count}</span>}</h2>
);

export function ScoreCard({ a }: { a: ResumeAnalysis }) {
  return (
    <section className="rounded-2xl border border-line bg-white p-6 sm:p-7" aria-label="Общая оценка">
      <div className="flex flex-col gap-8 sm:flex-row sm:items-center sm:gap-10">
        <div className="flex items-center gap-5 sm:block sm:text-center" data-testid="resume-score">
          <ScoreRing value={a.score} size={140} stroke={9} />
          <div className="sm:mt-3"><div className="text-[15px] font-medium">{scoreVerdict(a.score)}</div><div className="text-[13px] text-muted">Общая оценка</div></div>
        </div>
        <div className="grid flex-1 gap-x-10 gap-y-4 sm:grid-cols-2">
          {BREAKDOWN.map(([k, l]) => <Meter key={k} label={l} value={a.breakdown[k]} />)}
        </div>
      </div>
    </section>
  );
}

/** Результаты анализа: смысловые группы на линиях, а не россыпь карточек. */
export function ResumeAnalysisView({ a }: { a: ResumeAnalysis }) {
  return (
    <div className="stagger space-y-6">
      <ScoreCard a={a} />

      <section className="rounded-2xl border border-line bg-white" aria-labelledby="improve">
        <div className="border-b border-line px-6 py-4"><SectionTitle id="improve" count={a.improvements.length}>Что улучшить</SectionTitle></div>
        <ol className="divide-y divide-line">
          {a.improvements.map((it, i) => (
            <li key={i} className="flex gap-4 px-6 py-4">
              <span className="tabular flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent-50 text-[13px] font-semibold text-accent-700">{i + 1}</span>
              <div className="min-w-0"><h3 className="font-sans text-[15px] font-semibold" style={{ letterSpacing: 0 }}>{it.title}</h3><p className="mt-1 text-sm leading-relaxed text-ink-2">{it.detail}</p></div>
            </li>
          ))}
        </ol>
      </section>

      <section className="rounded-2xl border border-line bg-white" aria-labelledby="strengths">
        <div className="border-b border-line px-6 py-4"><SectionTitle id="strengths" count={a.strengths.length}>Сильные стороны</SectionTitle></div>
        <ul className="divide-y divide-line">
          {a.strengths.map((s, i) => (
            <li key={i} className="flex gap-3.5 px-6 py-3.5 text-[15px] leading-relaxed">
              <Icon name="check" size={17} strokeWidth={2.2} className="mt-1 shrink-0 text-ink" />{s}
            </li>
          ))}
        </ul>
      </section>

      <div className="grid gap-6 md:grid-cols-2">
        <section className="rounded-2xl border border-line bg-white p-6" aria-labelledby="missing">
          <SectionTitle id="missing">Недостающие навыки</SectionTitle>
          {a.missingSkills.length > 0 ? (
            <>
              <p className="mb-4 mt-1.5 text-[13px] text-muted">Типичны для профессии, но не найдены в резюме. Добавляйте только то, чем действительно владеете.</p>
              <ul className="flex flex-wrap gap-2">{a.missingSkills.map((s) => <li key={s} className="rounded-full border border-line-strong bg-milk px-3 py-1 text-[13px] text-ink">{s}</li>)}</ul>
            </>
          ) : (
            <p className="mt-3 flex items-start gap-2.5 text-sm leading-relaxed text-ink-2"><Icon name="check-circle" size={17} className="mt-0.5 shrink-0 text-ink" />Ключевые навыки профессии уже отражены в резюме.</p>
          )}
        </section>
        <section className="rounded-2xl border border-line bg-white p-6" aria-labelledby="exp">
          <SectionTitle id="exp">Рекомендации по опыту</SectionTitle>
          <ul className="mt-4 space-y-3">{a.experienceTips.map((t, i) => <li key={i} className="flex gap-2.5 text-sm leading-relaxed"><Icon name="chevron-right" size={15} className="mt-1 shrink-0 text-accent-600" />{t}</li>)}</ul>
        </section>
      </div>
      <EngineNote engine={a.engine} />
    </div>
  );
}
