import { requirePageUser } from '@/lib/auth';
import { latestResume } from '@/lib/context';
import { relativeDay } from '@/lib/format';
import { parseJson, type ResumeAnalysis } from '@/lib/types';
import { Alert, EmptyState, LinkButton, PageHeader } from '@/components/ui';
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
        <PageHeader title="Моё резюме" subtitle="Оценка структуры, опыта, достижений, навыков и соответствия вашей профессии." />
        <ResumeUploader goalLabel={user.profession!.name} />
      </>
    );
  }
  const a = parseJson<ResumeAnalysis>(resume.analysis, null as unknown as ResumeAnalysis);
  const stale = resume.professionId !== user.professionId || resume.level !== user.level;
  return (
    <>
      <PageHeader
        title="Моё резюме"
        subtitle={<span className="inline-flex flex-wrap items-center gap-x-4 gap-y-1 text-sm"><span className="inline-flex items-center gap-1.5"><Icon name="clock" size={14} className="text-muted" />Последний анализ: {relativeDay(resume.analyzedAt)}</span><span className="inline-flex items-center gap-1.5 text-muted"><Icon name="file" size={14} />{resume.fileName}</span></span>}
        action={<LinkButton href="/vacancies">Улучшить резюме<Icon name="arrow-right" size={16} /></LinkButton>}
      />
      {stale && <Alert tone="warn" className="mb-6"><div className="flex flex-wrap items-center justify-between gap-3"><span>Оценка сделана для прежней цели. Пересчитайте её под текущую профессию и уровень.</span><ReanalyzeButton /></div></Alert>}
      <ResumeAnalysisView a={a} />
      <section className="mt-10 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-6">
        <details className="group w-full">
          <summary className="flex cursor-pointer list-none items-center gap-1.5 text-sm font-medium text-ink-2 hover:text-ink"><Icon name="chevron-right" size={15} className="transition-transform group-open:rotate-90" />Извлечённый текст резюме</summary>
          <pre className="mt-4 max-h-96 overflow-auto whitespace-pre-wrap rounded-xl border border-line bg-white p-5 text-[13px] leading-relaxed text-ink-2">{resume.text}</pre>
        </details>
        <div className="flex w-full flex-wrap items-center gap-2 pt-2"><ResumeUploader variant="button" label="Загрузить новую версию" /><DeleteResumeButton /></div>
      </section>
    </>
  );
}
