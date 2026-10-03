import Link from 'next/link';
import { requirePageUser } from '@/lib/auth';
import { latestResume } from '@/lib/context';
import { db } from '@/lib/db';
import { parseJson, type ResumeAnalysis } from '@/lib/types';
import { Card, EmptyState, PageHeader, Badge } from '@/components/ui';
import ResumeUploader from '@/components/ResumeUploader';
import { ImprovementList, ScoreCard } from '@/components/ResumeAnalysisView';

export default async function Dashboard() {
  const user = await requirePageUser();
  const resume = await latestResume(user.id);

  if (!resume) {
    return (
      <>
        <PageHeader title={`Здравствуйте, ${user.name.split(' ')[0]}`} />
        <EmptyState
          title="Подготовьте резюме для поиска работы"
          text="Загрузите своё резюме, и мы проанализируем его с учётом вашей целевой профессии."
          action={<ResumeUploader />}
        />
        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          {[['1', 'Загрузите резюме', 'Оценка по 6 критериям под вашу профессию'], ['2', 'Добавьте вакансию', 'Покажем соответствие и чего не хватает'], ['3', 'Адаптируйте и откликайтесь', 'Резюме, письмо и подготовка к интервью']].map(([n, t, d]) => (
            <Card key={n}><div className="mb-2 flex h-6 w-6 items-center justify-center rounded-full bg-accent-50 text-xs font-semibold text-accent-700">{n}</div><div className="text-sm font-medium">{t}</div><div className="mt-0.5 text-sm text-muted">{d}</div></Card>
          ))}
        </div>
      </>
    );
  }

  const a = parseJson<ResumeAnalysis>(resume.analysis, null as unknown as ResumeAnalysis);
  const stale = resume.professionId !== user.professionId || resume.level !== user.level;
  const vacancies = await db.vacancy.count({ where: { userId: user.id } });

  return (
    <>
      <PageHeader title="Главная" subtitle="Состояние вашей подготовки к поиску работы" />
      <Card className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-xs font-medium uppercase tracking-wider text-muted">Моё резюме</div>
          <div className="mt-1 font-medium" data-testid="resume-file-name">{resume.fileName}</div>
          <div className="text-sm text-muted">{user.name}</div>
        </div>
        <div className="flex items-center gap-2">
          {stale && <Badge tone="amber">Оценка для прежней профессии</Badge>}
          <Link href="/resume" className="text-sm font-medium text-accent-600 hover:underline">Подробный анализ →</Link>
        </div>
      </Card>
      <div className="space-y-5">
        <ScoreCard a={a} />
        <Card>
          <h2 className="mb-4 text-sm font-semibold text-muted">Что улучшить</h2>
          <ImprovementList items={a.improvements} limit={5} />
          <div className="mt-5"><Link href="/resume" className="inline-flex h-10 items-center rounded-lg bg-accent-600 px-4 text-sm font-medium text-white hover:bg-accent-700">Улучшить резюме</Link></div>
        </Card>
        <div className="grid gap-5 sm:grid-cols-2">
          <Card>
            <div className="text-sm font-semibold">Вакансии</div>
            <p className="mt-1 text-sm text-muted">{vacancies ? `Проанализировано вакансий: ${vacancies}` : 'Вставьте описание вакансии — покажем соответствие и адаптируем резюме.'}</p>
            <Link href="/vacancies" className="mt-3 inline-block text-sm font-medium text-accent-600 hover:underline">Перейти к вакансиям →</Link>
          </Card>
          <Card>
            <div className="text-sm font-semibold">Собеседование</div>
            <p className="mt-1 text-sm text-muted">Банк вопросов и тренажёр ответов для вашей профессии и уровня.</p>
            <Link href="/interview" className="mt-3 inline-block text-sm font-medium text-accent-600 hover:underline">Начать подготовку →</Link>
          </Card>
        </div>
      </div>
    </>
  );
}
