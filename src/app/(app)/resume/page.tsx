import Link from 'next/link';
import { requirePageUser } from '@/lib/auth';
import { latestResume } from '@/lib/context';
import { db } from '@/lib/db';
import { relativeDay } from '@/lib/format';
import { parseJson, type ResumeAnalysis } from '@/lib/types';
import { Alert, PageHeader, buttonClass } from '@/components/ui';
import Icon from '@/components/Icon';
import ResumeUploader from '@/components/ResumeUploader';
import { ResumeAnalysisView } from '@/components/ResumeAnalysisView';
import { DeleteResumeButton, ReanalyzeButton } from '@/components/ResumeActions';

export default async function ResumePage() {
  const user = await requirePageUser();
  const resume = await latestResume(user.id);
  if (!resume) {
    return (
      <>
        <PageHeader title="Моё резюме" subtitle="Загрузите резюме — оценим структуру, опыт, достижения, навыки, соответствие профессии и читаемость для ATS." />
        <div className="max-w-3xl"><ResumeUploader goalLabel={user.profession!.name} /></div>
      </>
    );
  }
  const a = parseJson<ResumeAnalysis>(resume.analysis, null as unknown as ResumeAnalysis);
  const stale = resume.professionId !== user.professionId || resume.level !== user.level;
  const lastVacancy = await db.vacancy.findFirst({ where: { userId: user.id }, orderBy: { createdAt: 'desc' }, select: { id: true, title: true } });

  return (
    <>
      <PageHeader
        title="Моё резюме"
        subtitle={<span className="inline-flex flex-wrap items-center gap-x-4 gap-y-1 text-sm"><span className="inline-flex items-center gap-1.5"><Icon name="clock" size={14} className="text-muted" />Последний анализ: {relativeDay(resume.analyzedAt)}</span><span className="text-muted">для цели «{user.profession!.name}»</span></span>}
        action={<Link href="/vacancies" className={buttonClass({ size: 'lg' })}>Улучшить резюме<Icon name="arrow-right" size={16} /></Link>}
      />
      {stale && <Alert tone="warn" className="mb-6"><div className="flex flex-wrap items-center justify-between gap-3"><span>Оценка сделана для прежней цели. Пересчитайте её под текущую профессию и уровень.</span><ReanalyzeButton /></div></Alert>}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px] lg:gap-8">
        <ResumeAnalysisView a={a} />

        <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          <section className="rounded-2xl border border-line bg-white p-5">
            <div className="text-[13px] font-medium text-accent-600">Что дальше</div>
            <h2 className="mt-1.5 text-[17px] font-semibold leading-snug tracking-[-0.01em]">Улучшите резюме под конкретную вакансию</h2>
            <p className="mt-1.5 text-sm leading-relaxed text-ink-2">Сравним с требованиями и предложим правки формулировок — их можно принять, отклонить или отредактировать.</p>
            <Link href={lastVacancy ? `/vacancies/${lastVacancy.id}` : '/vacancies'} className={buttonClass({ variant: 'dark', className: 'mt-4 w-full' })}>{lastVacancy ? 'К последней вакансии' : 'Добавить вакансию'}</Link>
          </section>
          <section className="rounded-2xl border border-line bg-white p-5" aria-label="Файл резюме">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-stone text-ink-2"><Icon name="file" size={18} /></span>
              <div className="min-w-0"><div className="truncate text-sm font-medium">{resume.fileName}</div><div className="text-xs text-muted">Загружено {relativeDay(resume.createdAt)}</div></div>
            </div>
            <div className="mt-4 space-y-1">
              <ResumeUploader variant="button" label="Заменить резюме" />
              <DeleteResumeButton />
            </div>
          </section>
        </aside>
      </div>

      <details className="group mt-10 border-t border-line pt-6">
        <summary className="flex cursor-pointer list-none items-center gap-1.5 text-sm font-medium text-ink-2 hover:text-ink"><Icon name="chevron-right" size={15} className="transition-transform group-open:rotate-90" />Извлечённый текст резюме</summary>
        <pre className="mt-4 max-h-96 overflow-auto user-text whitespace-pre-wrap rounded-2xl border border-line bg-white p-5 font-sans text-[13px] leading-relaxed text-ink-2">{resume.text}</pre>
      </details>
    </>
  );
}
