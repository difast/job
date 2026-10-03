import Link from 'next/link';
import { requirePageUser } from '@/lib/auth';
import { latestResume } from '@/lib/context';
import { db } from '@/lib/db';
import { relativeDay } from '@/lib/format';
import { Badge, PageHeader, scoreTone } from '@/components/ui';
import Icon from '@/components/Icon';
import VacancyForm from '@/components/VacancyForm';

export default async function VacanciesPage() {
  const user = await requirePageUser();
  const [resume, vacancies] = await Promise.all([
    latestResume(user.id),
    db.vacancy.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'desc' }, include: { adaptation: { select: { id: true } } } }),
  ]);
  return (
    <>
      <PageHeader title="Анализ вакансии" subtitle="Вставьте текст вакансии — покажем, насколько вы ей соответствуете, и подскажем, как усилить резюме без выдуманных фактов." />
      <VacancyForm hasResume={!!resume} />
      {vacancies.length > 0 && (
        <section className="mt-12" aria-labelledby="hist">
          <h2 id="hist" className="mb-3 text-lg font-semibold tracking-tight">Ваши вакансии</h2>
          <ul className="overflow-hidden rounded-xl border border-line bg-white shadow-card">
            {vacancies.map((v) => (
              <li key={v.id} className="border-b border-line last:border-b-0">
                <Link href={`/vacancies/${v.id}`} className="group flex items-center gap-4 px-4 py-4 transition-colors hover:bg-canvas sm:px-5">
                  <div className={`tabular w-14 shrink-0 text-xl font-semibold tracking-tight ${scoreTone(v.matchScore)}`}>{v.matchScore}%</div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[15px] font-medium">{v.title}</div>
                    <div className="mt-0.5 flex items-center gap-2 text-[13px] text-muted">{relativeDay(v.createdAt)}{v.adaptation && <Badge tone="accent">Резюме адаптировано</Badge>}</div>
                  </div>
                  <Icon name="chevron-right" size={17} className="shrink-0 text-muted transition-transform group-hover:translate-x-0.5" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
