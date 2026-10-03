import Link from 'next/link';
import { requirePageUser } from '@/lib/auth';
import { latestResume } from '@/lib/context';
import { db } from '@/lib/db';
import { Badge, Card, PageHeader, scoreTone } from '@/components/ui';
import VacancyForm from '@/components/VacancyForm';

export default async function VacanciesPage() {
  const user = await requirePageUser();
  const [resume, vacancies] = await Promise.all([
    latestResume(user.id),
    db.vacancy.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'desc' }, include: { adaptation: { select: { id: true } } } }),
  ]);
  return (
    <>
      <PageHeader title="Вакансии" subtitle="Вставьте текст вакансии — сравним с вашим резюме, покажем, чего не хватает, и адаптируем резюме без выдуманных фактов." />
      <VacancyForm hasResume={!!resume} />
      {vacancies.length > 0 && (
        <section className="mt-10">
          <h2 className="mb-3 text-sm font-semibold text-muted">Проанализированные вакансии</h2>
          <div className="space-y-2">
            {vacancies.map((v) => (
              <Link key={v.id} href={`/vacancies/${v.id}`} className="block">
                <Card className="flex items-center justify-between gap-4 p-4 transition hover:border-slate-300">
                  <div className="min-w-0">
                    <div className="truncate font-medium">{v.title}</div>
                    <div className="mt-0.5 flex items-center gap-2 text-xs text-muted">{v.createdAt.toLocaleDateString('ru-RU')}{v.adaptation && <Badge tone="accent">Резюме адаптировано</Badge>}</div>
                  </div>
                  <div className={`text-lg font-semibold tabular-nums ${scoreTone(v.matchScore)}`}>{v.matchScore}%</div>
                </Card>
              </Link>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
