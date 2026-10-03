import { notFound } from 'next/navigation';
import { requirePageUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { parseJson, type VacancyAnalysis } from '@/lib/types';
import { PageHeader } from '@/components/ui';
import Icon from '@/components/Icon';
import VacancyAnalysisView from '@/components/VacancyAnalysisView';
import VacancyActions from '@/components/VacancyActions';

export default async function VacancyPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePageUser();
  const { id } = await params;
  const v = await db.vacancy.findFirst({ where: { id, userId: user.id }, include: { adaptation: { select: { id: true } } } });
  if (!v) notFound();
  const a = parseJson<VacancyAnalysis>(v.analysis, null as unknown as VacancyAnalysis);
  return (
    <>
      <PageHeader back={{ href: '/vacancies', label: 'Все вакансии' }} title={v.title} subtitle="Результат сравнения вашего резюме с вакансией" />
      <div className="mb-8"><VacancyActions id={v.id} hasAdaptation={!!v.adaptation} /></div>
      <VacancyAnalysisView a={a} />
      <details className="group mt-10 border-t border-line pt-6">
        <summary className="flex cursor-pointer list-none items-center gap-1.5 text-sm font-medium text-ink-2 hover:text-ink"><Icon name="chevron-right" size={15} className="transition-transform group-open:rotate-90" />Текст вакансии</summary>
        <pre className="mt-4 max-h-96 overflow-auto whitespace-pre-wrap rounded-xl border border-line bg-white p-5 text-[13px] leading-relaxed text-ink-2">{v.text}</pre>
      </details>
    </>
  );
}
