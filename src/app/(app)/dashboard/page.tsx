import Link from 'next/link';
import { requirePageUser } from '@/lib/auth';
import { latestResume } from '@/lib/context';
import { db } from '@/lib/db';
import { greeting } from '@/lib/format';
import { LEVEL_SHORT, parseJson, type LevelKey, type ResumeAnalysis } from '@/lib/types';
import { Card, LinkButton, Meter, PageHeader, ScoreRing } from '@/components/ui';
import Icon, { type IconName } from '@/components/Icon';
import { ChangeGoalButton } from '@/components/GoalContext';
import ResumeUploader from '@/components/ResumeUploader';

export default async function Dashboard() {
  const user = await requirePageUser();
  const [resume, lastVacancy] = await Promise.all([
    latestResume(user.id),
    db.vacancy.findFirst({ where: { userId: user.id }, orderBy: { createdAt: 'desc' }, select: { id: true, title: true } }),
  ]);
  const a = resume ? parseJson<ResumeAnalysis>(resume.analysis, null as unknown as ResumeAnalysis) : null;
  const profession = user.profession!.name;

  const actions: { href: string; icon: IconName; title: string; text: string }[] = [
    { href: '/vacancies', icon: 'search', title: 'Проанализировать вакансию', text: 'Сравните резюме с требованиями и узнайте процент соответствия.' },
    { href: lastVacancy ? `/vacancies/${lastVacancy.id}` : '/vacancies', icon: 'layers', title: 'Адаптировать резюме', text: lastVacancy ? `Под вакансию «${lastVacancy.title}».` : 'Подстройте формулировки под конкретную вакансию.' },
    { href: '/cover-letter', icon: 'mail', title: 'Создать сопроводительное', text: 'Письмо на основе вашего резюме и вакансии.' },
    { href: '/interview', icon: 'mic', title: 'Тренировать собеседование', text: 'Вопросы и разбор ответов для вашей профессии.' },
  ];

  return (
    <>
      <PageHeader
        title={`${greeting()}, ${user.name.split(' ')[0]}`}
        subtitle={<span className="inline-flex flex-wrap items-center gap-x-3 gap-y-2"><span data-testid="goal-line">Ваша цель: <b className="font-medium text-ink">{profession} · {LEVEL_SHORT[user.level as LevelKey]}</b></span><ChangeGoalButton /></span>}
      />
      <div className="stagger space-y-8">
        {!resume || !a ? (
          <ResumeUploader goalLabel={profession} />
        ) : (
          <Card>
            <div className="mb-5 flex items-center justify-between gap-3">
              <div className="min-w-0"><h2 className="text-[13px] font-medium text-muted">Резюме</h2><div className="mt-0.5 truncate text-sm text-ink-2" data-testid="resume-file-name">{resume.fileName}</div></div>
              <LinkButton href="/resume" variant="secondary" size="sm" className="hidden sm:inline-flex">Посмотреть анализ</LinkButton>
            </div>
            <div className="flex flex-col gap-7 sm:flex-row sm:items-center sm:gap-10">
              <div data-testid="resume-score"><ScoreRing value={a.score} size={128} stroke={8} /></div>
              <div className="grid flex-1 gap-x-10 gap-y-4 sm:grid-cols-2">
                <Meter label="Структура" value={a.breakdown.structure} />
                <Meter label="Опыт" value={a.breakdown.experience} />
                <Meter label="Навыки" value={a.breakdown.skills} />
                <Meter label="Достижения" value={a.breakdown.achievements} />
              </div>
            </div>
            <LinkButton href="/resume" className="mt-6 w-full sm:hidden">Посмотреть анализ</LinkButton>
          </Card>
        )}

        <section aria-labelledby="qa">
          <h2 id="qa" className="mb-3 text-lg font-semibold tracking-tight">Что дальше</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {actions.map((x) => (
              <Link key={x.title} href={x.href} className="group flex flex-col rounded-xl border border-line bg-white p-5 shadow-card transition-[border-color,box-shadow,transform] duration-150 hover:-translate-y-px hover:border-line-strong hover:shadow-[0_6px_20px_-10px_rgba(14,17,32,0.2)]">
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent-50 text-accent-600 transition-colors group-hover:bg-accent-100"><Icon name={x.icon} size={19} /></span>
                <h3 className="mt-4 text-[15px] font-semibold leading-snug tracking-tight">{x.title}</h3>
                <p className="mt-1.5 flex-1 text-[13px] leading-relaxed text-ink-2">{x.text}</p>
                <span className="mt-4 inline-flex items-center gap-1 text-[13px] font-medium text-accent-600">Открыть<Icon name="arrow-right" size={14} className="transition-transform group-hover:translate-x-0.5" /></span>
              </Link>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}
