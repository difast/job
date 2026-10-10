import { notFound } from 'next/navigation';
import { requirePageUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { parseJson, type Change } from '@/lib/types';
import { PageHeader } from '@/components/ui';
import AdaptationEditor from '@/components/AdaptationEditor';
import { JobTooCard } from '@/components/JobTooButton';
import { jobtooButtonState } from '@/lib/partners/state';

export default async function AdaptPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePageUser();
  const { id } = await params;
  const v = await db.vacancy.findFirst({ where: { id, userId: user.id }, include: { adaptation: { include: { resume: true } } } });
  if (!v || !v.adaptation) notFound();
  const jt = await jobtooButtonState(user.id);
  return (
    <>
      <PageHeader back={{ href: `/vacancies/${v.id}`, label: 'Анализ вакансии' }} title="Резюме под вакансию" subtitle={`«${v.title}». Принимайте, отклоняйте и редактируйте правки — итог можно скачать в PDF.`} />
      <AdaptationEditor id={v.adaptation.id} vacancyId={v.id} vacancyTitle={v.title} original={v.adaptation.resume.text}
        initial={parseJson<Change[]>(v.adaptation.changes, [])} engine={v.adaptation.engine} />
      {jt && <div className="mt-6"><JobTooCard placement="adaptation" state={jt} vacancyId={v.id} layout="row" /></div>}
    </>
  );
}
