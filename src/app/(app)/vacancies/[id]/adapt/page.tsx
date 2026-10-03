import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requirePageUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { parseJson, type Change } from '@/lib/types';
import { PageHeader } from '@/components/ui';
import AdaptationEditor from '@/components/AdaptationEditor';

export default async function AdaptPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePageUser();
  const { id } = await params;
  const v = await db.vacancy.findFirst({ where: { id, userId: user.id }, include: { adaptation: { include: { resume: true } } } });
  if (!v || !v.adaptation) notFound();
  return (
    <>
      <Link href={`/vacancies/${v.id}`} className="mb-3 inline-block text-sm text-muted hover:text-ink">← Анализ вакансии</Link>
      <PageHeader title="Адаптация резюме" subtitle={`Вакансия: ${v.title}. Принимайте, отклоняйте и редактируйте правки — итог можно скачать в PDF.`} />
      <AdaptationEditor id={v.adaptation.id} vacancyId={v.id} vacancyTitle={v.title} original={v.adaptation.resume.text}
        initial={parseJson<Change[]>(v.adaptation.changes, [])} engine={v.adaptation.engine} />
    </>
  );
}
