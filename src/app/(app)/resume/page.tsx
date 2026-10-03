import { requirePageUser } from '@/lib/auth';
import { latestResume } from '@/lib/context';
import { parseJson, type ResumeAnalysis } from '@/lib/types';
import { Card, EmptyState, PageHeader } from '@/components/ui';
import ResumeUploader from '@/components/ResumeUploader';
import { ResumeAnalysisView } from '@/components/ResumeAnalysisView';
import ResumeActions from '@/components/ResumeActions';

export default async function ResumePage() {
  const user = await requirePageUser();
  const resume = await latestResume(user.id);
  if (!resume) {
    return (
      <>
        <PageHeader title="Моё резюме" />
        <EmptyState title="Резюме ещё не загружено" text="Загрузите PDF или DOCX — мы извлечём текст и оценим резюме по структуре, опыту, достижениям, навыкам, соответствию профессии и ATS." action={<ResumeUploader />} />
      </>
    );
  }
  const a = parseJson<ResumeAnalysis>(resume.analysis, null as unknown as ResumeAnalysis);
  const stale = resume.professionId !== user.professionId || resume.level !== user.level;
  return (
    <>
      <PageHeader title="Моё резюме" subtitle={`${resume.fileName} · загружено ${resume.createdAt.toLocaleDateString('ru-RU')}`} action={<ResumeUploader label="Загрузить новую версию" variant="secondary" />} />
      {stale && (
        <Card className="mb-5 border-amber-200 bg-amber-50">
          <p className="mb-3 text-sm text-amber-900">Вы изменили профессию или уровень — оценка ниже сделана для прежнего выбора.</p>
          <ResumeActions stale />
        </Card>
      )}
      <ResumeAnalysisView a={a} />
      <details className="mt-8 rounded-xl border border-line bg-white p-5">
        <summary className="cursor-pointer text-sm font-medium">Извлечённый текст резюме</summary>
        <pre className="mt-4 max-h-96 overflow-auto whitespace-pre-wrap text-sm text-slate-700">{resume.text}</pre>
      </details>
      {!stale && <div className="mt-6"><ResumeActions stale={false} /></div>}
    </>
  );
}
