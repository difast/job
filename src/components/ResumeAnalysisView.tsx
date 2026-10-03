import Icon from './Icon';
import { Card, CardTitle, Chip, EngineNote, Meter, ScoreRing } from './ui';
import type { ResumeAnalysis } from '@/lib/types';

export const BREAKDOWN: [keyof ResumeAnalysis['breakdown'], string][] = [
  ['structure', 'Структура'], ['experience', 'Опыт'], ['achievements', 'Достижения'], ['skills', 'Навыки'], ['fit', 'Соответствие профессии'], ['ats', 'ATS'],
];

const verdict = (n: number) => (n >= 80 ? 'Сильное резюме' : n >= 65 ? 'Хорошая основа' : n >= 45 ? 'Есть над чем поработать' : 'Требует серьёзной доработки');

export function ScoreCard({ a }: { a: ResumeAnalysis }) {
  return (
    <Card>
      <div className="flex flex-col gap-8 sm:flex-row sm:items-center sm:gap-10">
        <div className="flex items-center gap-6 sm:block sm:text-center" data-testid="resume-score">
          <ScoreRing value={a.score} size={144} stroke={9} />
          <div className="sm:mt-3"><div className="text-sm font-medium">{verdict(a.score)}</div><div className="text-[13px] text-muted">Общая оценка</div></div>
        </div>
        <div className="grid flex-1 gap-x-10 gap-y-4 sm:grid-cols-2">
          {BREAKDOWN.map(([k, l]) => <Meter key={k} label={l} value={a.breakdown[k]} />)}
        </div>
      </div>
    </Card>
  );
}

export function ResumeAnalysisView({ a }: { a: ResumeAnalysis }) {
  return (
    <div className="stagger space-y-8">
      <ScoreCard a={a} />

      <section aria-labelledby="strengths">
        <h2 id="strengths" className="mb-3 text-lg font-semibold tracking-tight">Сильные стороны</h2>
        <ul className="grid gap-3 sm:grid-cols-2">
          {a.strengths.map((s, i) => (
            <li key={i} className="flex gap-3 rounded-xl border border-line bg-white p-4 shadow-card">
              <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-ok-soft text-ok"><Icon name="check" size={14} strokeWidth={2.4} /></span>
              <span className="text-sm leading-relaxed">{s}</span>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="improve">
        <h2 id="improve" className="mb-3 text-lg font-semibold tracking-tight">Что улучшить</h2>
        <ol className="grid gap-3">
          {a.improvements.map((it, i) => (
            <li key={i} className="flex gap-4 rounded-xl border border-line bg-white p-4 shadow-card sm:p-5">
              <span className="tabular flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-warn-soft text-[13px] font-semibold text-warn">{i + 1}</span>
              <div><h3 className="text-[15px] font-semibold tracking-tight">{it.title}</h3><p className="mt-1 text-sm leading-relaxed text-ink-2">{it.detail}</p></div>
            </li>
          ))}
        </ol>
      </section>

      <div className="grid gap-5 md:grid-cols-2">
        <Card>
          <CardTitle icon="plus">Недостаёт</CardTitle>
          {a.missingSkills.length > 0 ? (
            <>
              <p className="mb-3 text-[13px] text-muted">Типичные навыки профессии, которых нет в резюме. Добавляйте только то, чем владеете.</p>
              <div className="flex flex-wrap gap-2">{a.missingSkills.map((s) => <Chip key={s}>{s}</Chip>)}</div>
            </>
          ) : (
            <p className="flex items-start gap-2.5 text-sm leading-relaxed text-ink-2"><Icon name="check-circle" size={17} className="mt-0.5 shrink-0 text-ok" />Ключевые навыки вашей профессии уже отражены в резюме.</p>
          )}
        </Card>
        <Card>
          <CardTitle icon="trend">Рекомендации по опыту</CardTitle>
          <ul className="space-y-2.5">{a.experienceTips.map((t, i) => <li key={i} className="flex gap-2.5 text-sm leading-relaxed"><Icon name="chevron-right" size={15} className="mt-1 shrink-0 text-accent-600" />{t}</li>)}</ul>
        </Card>
      </div>
      <EngineNote engine={a.engine} />
    </div>
  );
}
