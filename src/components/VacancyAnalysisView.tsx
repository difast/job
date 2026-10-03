import { Badge, Card, EngineNote, ScoreRing } from './ui';
import type { ReqStatus, VacancyAnalysis } from '@/lib/types';

const ST: Record<ReqStatus, { icon: string; label: string; tone: 'green' | 'amber' | 'red' }> = {
  match: { icon: '✓', label: 'Соответствует', tone: 'green' },
  partial: { icon: '⚠️', label: 'Частично', tone: 'amber' },
  missing: { icon: '✗', label: 'Не найдено', tone: 'red' },
};

function List({ items, empty }: { items: string[]; empty: string }) {
  if (!items.length) return <p className="text-sm text-muted">{empty}</p>;
  return <ul className="space-y-2">{items.map((s, i) => <li key={i} className="flex gap-2.5 text-sm"><span className="text-slate-400">●</span><span>{s}</span></li>)}</ul>;
}

export default function VacancyAnalysisView({ a }: { a: VacancyAnalysis }) {
  return (
    <div className="space-y-5">
      <Card>
        <div className="flex flex-col items-center gap-6 sm:flex-row">
          <div data-testid="match-score"><ScoreRing value={a.matchScore} suffix="%" /></div>
          <div>
            <h2 className="text-sm font-semibold text-muted">Соответствие вакансии</h2>
            <p className="mt-1 text-3xl font-semibold tabular-nums">{a.matchScore}%</p>
            <p className="mt-1 text-sm text-muted">{a.matchScore >= 75 ? 'Сильное совпадение — резюме почти готово к отклику.' : a.matchScore >= 50 ? 'Хорошая база: адаптация резюме заметно повысит совпадение.' : 'Совпадение невысокое — оцените, насколько вакансия вам подходит.'}</p>
          </div>
        </div>
      </Card>
      <Card className="overflow-hidden p-0">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wider text-muted">
            <tr><th className="px-5 py-3 font-medium">Требование</th><th className="w-40 px-5 py-3 font-medium">Соответствие</th></tr>
          </thead>
          <tbody className="divide-y divide-line">
            {a.requirements.map((r, i) => (
              <tr key={i}>
                <td className="px-5 py-3"><div>{r.text}</div>{r.note && <div className="mt-0.5 text-xs text-muted">{r.note}</div>}</td>
                <td className="px-5 py-3 align-top"><Badge tone={ST[r.status].tone}><span aria-hidden>{ST[r.status].icon}</span>&nbsp;{ST[r.status].label}</Badge></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <div className="grid gap-5 md:grid-cols-2">
        <Card><h2 className="mb-4 text-sm font-semibold text-muted">Что есть в вашем резюме</h2><List items={a.present} empty="Пока не нашли подтверждённых требований." /></Card>
        <Card><h2 className="mb-4 text-sm font-semibold text-muted">Чего не хватает</h2><List items={a.missing} empty="Все требования так или иначе отражены в резюме." /></Card>
      </div>
      <Card><h2 className="mb-4 text-sm font-semibold text-muted">Что стоит изменить</h2><List items={a.suggestions} empty="Правки не требуются." /></Card>
      <EngineNote engine={a.engine} />
    </div>
  );
}
