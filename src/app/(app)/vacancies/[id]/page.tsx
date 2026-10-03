import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requirePageUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { parseJson, type VacancyAnalysis } from '@/lib/types';
import { PageHeader } from '@/components/ui';
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
      <Link href="/vacancies" className="mb-3 inline-block text-sm text-muted hover:text-ink">← Все вакансии</Link>
      <PageHeader title={v.title} subtitle="Результат сравнения вашего резюме с вакансией" />
      <div className="mb-6"><VacancyActions id={v.id} hasAdaptation={!!v.adaptation} /></div>
      <VacancyAnalysisView a={a} />
      <details className="mt-8 rounded-xl border border-line bg-white p-5">
        <summary className="cursor-pointer text-sm font-medium">Текст вакансии</summary>
        <pre className="mt-4 max-h-96 overflow-auto whitespace-pre-wrap text-sm text-slate-700">{v.text}</pre>
      </details>
    </>
  );
}
