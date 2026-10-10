import Icon, { type IconName } from './Icon';
import { EngineNote } from './ui';
import type { ReqStatus, VacancyAnalysis } from '@/lib/types';

// Смысловые состояния различимы и цветом, и значком, и подписью — но в палитре продукта
export const GROUPS: { status: ReqStatus; id: string; title: string; icon: IconName; tone: string; dot: string }[] = [
  { status: 'match', id: 'req-match', title: 'Вы соответствуете', icon: 'check', tone: 'text-ink', dot: 'bg-ink' },
  { status: 'partial', id: 'req-partial', title: 'Стоит усилить', icon: 'alert', tone: 'text-accent-600', dot: 'bg-accent-500' },
  { status: 'missing', id: 'req-missing', title: 'Не хватает', icon: 'x', tone: 'text-bad', dot: 'bg-bad' },
];

export default function VacancyAnalysisView({ a }: { a: VacancyAnalysis }) {
  return (
    <div className="stagger space-y-6">
      <section className="rounded-2xl border border-line bg-white" aria-label="Требования вакансии">
        {GROUPS.map((g) => {
          const items = a.requirements.filter((r) => r.status === g.status);
          if (!items.length) return null;
          return (
            <div key={g.status} id={g.id} className="scroll-mt-24 border-b border-line last:border-b-0">
              <h2 className="flex items-center gap-2.5 px-6 pb-2 pt-5 text-[17px] font-semibold tracking-[-0.01em]">
                <span className={`h-2 w-2 rounded-full ${g.dot}`} />{g.title}<span className="tabular font-sans text-sm font-normal text-muted">{items.length}</span>
              </h2>
              <ul className="pb-2">
                {items.map((r, i) => (
                  <li key={i} className="flex gap-3 px-6 py-2.5">
                    <Icon name={g.icon} size={16} strokeWidth={2.1} className={`mt-0.5 shrink-0 ${g.tone}`} />
                    <div className="user-text min-w-0"><div className="text-[15px] leading-relaxed">{r.text}</div>{r.note && <div className="mt-0.5 text-[13px] text-muted">{r.note}</div>}</div>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
        {a.requirements.length === 0 && <p className="px-6 py-5 text-sm text-ink-2">Не удалось выделить отдельные требования — оценка построена по пересечению ключевых слов. Добавьте в описание блок «Требования», чтобы получить подробный разбор.</p>}
      </section>

      {a.suggestions.length > 0 && (
        <section className="rounded-2xl border border-line bg-white p-6" aria-labelledby="sug">
          <h2 id="sug" className="text-[17px] font-semibold tracking-[-0.01em]">Что стоит изменить в резюме</h2>
          <ul className="mt-4 space-y-3">
            {a.suggestions.map((s, i) => <li key={i} className="user-text flex gap-3 text-[15px] leading-relaxed"><Icon name="chevron-right" size={15} className="mt-1.5 shrink-0 text-accent-600" />{s}</li>)}
          </ul>
        </section>
      )}
      <EngineNote engine={a.engine} />
    </div>
  );
}
