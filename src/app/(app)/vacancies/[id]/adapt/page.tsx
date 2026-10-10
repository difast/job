import { notFound } from 'next/navigation';
import { requirePageUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { parseJson, type Change } from '@/lib/types';
import { PageHeader } from '@/components/ui';
import AdaptationEditor from '@/components/AdaptationEditor';
import JobTooButton from '@/components/JobTooButton';
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
      {jt && (
        <section className="mt-6 flex flex-col gap-4 rounded-2xl border border-line bg-white p-5 sm:flex-row sm:items-center sm:justify-between" aria-label="JobToo" data-testid="jobtoo-card">
          <div className="min-w-0"><div className="text-[15px] font-medium">Откликнуться через JobToo</div><p className="mt-1 text-sm text-ink-2">Передадим профиль и резюме с принятыми правками — регистрироваться заново не нужно.</p></div>
          <JobTooButton placement="adaptation" vacancyId={v.id} hasConsent={jt.hasConsent} />
        </section>
      )}
    </>
  );
}
