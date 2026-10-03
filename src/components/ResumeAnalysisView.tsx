import { Bar, Card, EngineNote, ScoreRing } from './ui';
import type { ResumeAnalysis } from '@/lib/types';

const ROWS: [keyof ResumeAnalysis['breakdown'], string][] = [
  ['structure', 'Структура'], ['experience', 'Опыт'], ['achievements', 'Достижения'], ['skills', 'Навыки'], ['fit', 'Соответствие профессии'], ['ats', 'ATS'],
];

export function ScoreCard({ a }: { a: ResumeAnalysis }) {
  return (
    <Card>
      <h2 className="mb-5 text-sm font-semibold text-muted">Общая оценка</h2>
      <div className="flex flex-col items-center gap-8 sm:flex-row">
        <div data-testid="resume-score"><ScoreRing value={a.score} /></div>
        <div className="grid w-full flex-1 gap-x-8 gap-y-4 sm:grid-cols-2">
          {ROWS.map(([k, l]) => <Bar key={k} label={l} value={a.breakdown[k]} />)}
        </div>
      </div>
    </Card>
  );
}

export function ImprovementList({ items, limit }: { items: ResumeAnalysis['improvements']; limit?: number }) {
  return (
    <ul className="space-y-3">
      {items.slice(0, limit).map((it, i) => (
        <li key={i} className="flex gap-3">
          <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-50 text-xs font-semibold text-amber-700">{i + 1}</span>
          <div><div className="text-sm font-medium">{it.title}</div><div className="text-sm text-muted">{it.detail}</div></div>
        </li>
      ))}
    </ul>
  );
}

function Bullets({ items, tone }: { items: string[]; tone: 'green' | 'slate' }) {
  return (
    <ul className="space-y-2">
      {items.map((s, i) => (
        <li key={i} className="flex gap-2.5 text-sm">
          <span className={tone === 'green' ? 'text-emerald-500' : 'text-slate-400'}>●</span><span>{s}</span>
        </li>
      ))}
    </ul>
  );
}

export function ResumeAnalysisView({ a }: { a: ResumeAnalysis }) {
  return (
    <div className="space-y-5">
      <ScoreCard a={a} />
      <div className="grid gap-5 md:grid-cols-2">
        <Card><h2 className="mb-4 text-sm font-semibold text-muted">Сильные стороны</h2><Bullets items={a.strengths} tone="green" /></Card>
        <Card><h2 className="mb-4 text-sm font-semibold text-muted">Что улучшить</h2><ImprovementList items={a.improvements} /></Card>
        {a.missingSkills.length > 0 && (
          <Card>
            <h2 className="mb-1 text-sm font-semibold text-muted">Недостающие навыки</h2>
            <p className="mb-3 text-xs text-muted">Типичны для профессии. Добавляйте только те, которыми действительно владеете.</p>
            <div className="flex flex-wrap gap-2">{a.missingSkills.map((s) => <span key={s} className="rounded-md border border-line bg-slate-50 px-2 py-1 text-sm">{s}</span>)}</div>
          </Card>
        )}
        {a.experienceTips.length > 0 && <Card><h2 className="mb-4 text-sm font-semibold text-muted">Рекомендации по опыту</h2><Bullets items={a.experienceTips} tone="slate" /></Card>}
      </div>
      <EngineNote engine={a.engine} />
    </div>
  );
}
