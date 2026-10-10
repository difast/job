import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requirePageUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { relativeDay } from '@/lib/format';
import { parseJson, type VacancyAnalysis } from '@/lib/types';
import { PageHeader, ScoreRing, scoreTone } from '@/components/ui';
import Icon from '@/components/Icon';
import VacancyAnalysisView, { GROUPS } from '@/components/VacancyAnalysisView';
import { AdaptButton, DeleteVacancyButton } from '@/components/VacancyActions';

const summary = (n: number) => (n >= 75 ? 'Сильное совпадение — резюме почти готово к отклику.' : n >= 50 ? 'Хорошая база: адаптация резюме заметно повысит совпадение.' : 'Совпадение невысокое — оцените, насколько вакансия вам подходит.');

export default async function VacancyPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePageUser();
  const { id } = await params;
  const v = await db.vacancy.findFirst({ where: { id, userId: user.id }, include: { adaptation: { select: { id: true } } } });
  if (!v) notFound();
  const a = parseJson<VacancyAnalysis>(v.analysis, null as unknown as VacancyAnalysis);
  return (
    <>
      <PageHeader back={{ href: '/vacancies', label: 'Все вакансии' }} title={<span className="user-text">{v.title}</span>} subtitle={`Анализ от ${relativeDay(v.createdAt)} · сравнение с вашим резюме`} />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-8">
        <div className="order-2 min-w-0 lg:order-1"><VacancyAnalysisView a={a} /></div>

        {/* Сводка: оценка, счётчики-якоря и главное действие рядом */}
        <aside className="order-1 space-y-4 lg:sticky lg:top-24 lg:order-2 lg:self-start">
          <section className="rounded-2xl border border-line bg-white p-6">
            <div className="flex items-center gap-5">
              <div data-testid="match-score"><ScoreRing value={a.matchScore} size={96} stroke={7} suffix="" label={`Соответствие ${a.matchScore}%`} /></div>
              <div className="min-w-0">
                <div className={`tabular text-[32px] font-semibold leading-none tracking-[-0.03em] ${scoreTone(a.matchScore)}`} style={{ fontFamily: 'var(--font-display)' }}>{a.matchScore}%</div>
                <div className="mt-1.5 text-sm font-medium">соответствия вакансии</div>
              </div>
            </div>
            <p className="mt-4 text-sm leading-relaxed text-ink-2">{summary(a.matchScore)}</p>
            <ul className="mt-4 divide-y divide-line border-y border-line">
              {GROUPS.map((g) => {
                const n = a.requirements.filter((r) => r.status === g.status).length;
                return (
                  <li key={g.status}>
                    <a href={n ? `#${g.id}` : undefined} className={`flex h-10 items-center gap-2.5 text-sm ${n ? 'hover:text-accent-700' : 'text-muted'}`}>
                      <span className={`h-2 w-2 rounded-full ${g.dot}`} /><span className="flex-1">{g.title}</span><span className="tabular font-medium">{n}</span>
                    </a>
                  </li>
                );
              })}
            </ul>
            <div className="mt-5"><AdaptButton id={v.id} hasAdaptation={!!v.adaptation} /></div>
            <Link href={`/cover-letter?vacancy=${v.id}&create=1`} className="mt-3 flex h-10 items-center justify-center gap-2 rounded-lg text-sm font-medium text-ink-2 transition-colors hover:bg-subtle hover:text-ink"><Icon name="mail" size={15} />Создать сопроводительное письмо</Link>
          </section>
        </aside>
      </div>

      <div className="mt-10 border-t border-line pt-6">
        <details className="group">
          <summary className="flex cursor-pointer list-none items-center gap-1.5 text-sm font-medium text-ink-2 hover:text-ink"><Icon name="chevron-right" size={15} className="transition-transform group-open:rotate-90" />Текст вакансии</summary>
          <pre className="mt-4 max-h-96 overflow-auto user-text whitespace-pre-wrap rounded-2xl border border-line bg-white p-5 font-sans text-[13px] leading-relaxed text-ink-2">{v.text}</pre>
        </details>
        <div className="mt-4"><DeleteVacancyButton id={v.id} /></div>
      </div>
    </>
  );
}
