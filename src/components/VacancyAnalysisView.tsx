import Icon, { type IconName } from './Icon';
import { Card, EngineNote, ScoreRing, scoreTone } from './ui';
import type { ReqStatus, VacancyAnalysis } from '@/lib/types';

const GROUPS: { status: ReqStatus; title: string; icon: IconName; chip: string; text: string }[] = [
  { status: 'match', title: 'Вы соответствуете', icon: 'check-circle', chip: 'bg-ok-soft text-ok', text: '' },
  { status: 'partial', title: 'Стоит усилить', icon: 'alert', chip: 'bg-warn-soft text-warn', text: '' },
  { status: 'missing', title: 'Не хватает', icon: 'x-circle', chip: 'bg-bad-soft text-bad', text: '' },
];

const summary = (n: number) => (n >= 75 ? 'Сильное совпадение — резюме почти готово к отклику.' : n >= 50 ? 'Хорошая база: адаптация резюме заметно повысит совпадение.' : 'Совпадение невысокое — оцените, насколько вакансия вам подходит.');

export default function VacancyAnalysisView({ a }: { a: VacancyAnalysis }) {
  return (
    <div className="stagger space-y-8">
      <Card>
        <div className="flex flex-col items-center gap-7 text-center sm:flex-row sm:text-left">
          <div data-testid="match-score"><ScoreRing value={a.matchScore} size={120} stroke={8} suffix="" label={`Соответствие ${a.matchScore}%`} /></div>
          <div>
            <div className={`tabular text-[40px] font-semibold leading-none tracking-tight ${scoreTone(a.matchScore)}`}>{a.matchScore}%</div>
            <div className="mt-2 text-[15px] font-medium">соответствия вакансии</div>
            <p className="mt-1 max-w-md text-sm text-ink-2">{summary(a.matchScore)}</p>
          </div>
        </div>
      </Card>

      <div className="grid gap-5">
        {GROUPS.map((g) => {
          const items = a.requirements.filter((r) => r.status === g.status);
          if (!items.length) return null;
          return (
            <section key={g.status} aria-label={g.title}>
              <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold tracking-tight"><span className={`flex h-6 w-6 items-center justify-center rounded-full ${g.chip}`}><Icon name={g.icon === 'check-circle' ? 'check' : g.icon === 'x-circle' ? 'x' : 'alert'} size={13} strokeWidth={2.4} /></span>{g.title}<span className="tabular text-sm font-normal text-muted">{items.length}</span></h2>
              <ul className="overflow-hidden rounded-xl border border-line bg-white shadow-card">
                {items.map((r, i) => (
                  <li key={i} className="flex gap-3 border-b border-line px-4 py-3.5 last:border-b-0 sm:px-5">
                    <Icon name={g.status === 'match' ? 'check' : g.status === 'partial' ? 'alert' : 'x'} size={16} strokeWidth={2.1} className={`mt-0.5 shrink-0 ${g.status === 'match' ? 'text-ok' : g.status === 'partial' ? 'text-warn' : 'text-bad'}`} />
                    <div className="min-w-0"><div className="text-sm leading-relaxed">{r.text}</div>{r.note && <div className="mt-0.5 text-[13px] text-muted">{r.note}</div>}</div>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
        {a.requirements.length === 0 && <Card><p className="text-sm text-ink-2">Не удалось выделить отдельные требования — оценка построена по пересечению ключевых слов. Добавьте в описание блок «Требования», чтобы получить подробный разбор.</p></Card>}
      </div>

      {a.suggestions.length > 0 && (
        <section aria-labelledby="sug">
          <h2 id="sug" className="mb-3 text-lg font-semibold tracking-tight">Что стоит изменить в резюме</h2>
          <Card className="space-y-3">
            {a.suggestions.map((s, i) => <div key={i} className="flex gap-3 text-sm leading-relaxed"><Icon name="chevron-right" size={15} className="mt-1 shrink-0 text-accent-600" />{s}</div>)}
          </Card>
        </section>
      )}
      <EngineNote engine={a.engine} />
    </div>
  );
}
