import { requirePageUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { LEVEL_SHORT, parseJson, type LevelKey, type VacancyAnalysis } from '@/lib/types';
import InterviewClient from '@/components/InterviewClient';
import { ChangeGoalButton } from '@/components/GoalContext';
import { jobtooButtonState } from '@/lib/partners/state';
import { latestResume } from '@/lib/context';

const fmt = (d: Date) => d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', timeZone: 'Europe/Moscow' });

// Раздел «Собеседования»: тренажёр. ?vacancy=<id> — переход из вакансии или адаптации с её контекстом.
export default async function InterviewPage({ searchParams }: { searchParams: Promise<{ vacancy?: string }> }) {
  const user = await requirePageUser();
  const { vacancy } = await searchParams;
  const [vacancies, agg, recent, resume] = await Promise.all([
    db.vacancy.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'desc' }, take: 30, select: { id: true, title: true, matchScore: true, analysis: true } }),
    db.practiceAttempt.aggregate({ where: { userId: user.id }, _count: { _all: true }, _avg: { score: true } }),
    db.practiceAttempt.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'desc' }, take: 5, include: { question: { select: { text: true } } } }),
    latestResume(user.id),
  ]);
  const jt = resume ? await jobtooButtonState(user.id) : null;
  const list = vacancies.map((v) => {
    const a = parseJson<VacancyAnalysis>(v.analysis, null as unknown as VacancyAnalysis);
    // фокус подготовки: требования, которые в резюме не раскрыты или раскрыты частично
    const focus = (a?.requirements ?? []).filter((r) => r.status !== 'match').slice(0, 5).map((r) => r.text);
    return { id: v.id, title: v.title, matchScore: v.matchScore, focus };
  });
  return (
    <>
      <header className="mx-auto mb-8 max-w-[820px]">
        <h1 className="text-[28px] font-semibold leading-[1.15] tracking-[-0.025em] sm:text-[32px]">Собеседования</h1>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[15px] text-ink-2">
          <span>Тренажёр вопросов для <b className="font-medium text-ink">{user.profession!.name} · {LEVEL_SHORT[user.level as LevelKey]}</b></span>
          <ChangeGoalButton variant="ghost" />
        </div>
      </header>
      <InterviewClient
        vacancies={list}
        initialVacancyId={list.some((v) => v.id === vacancy) ? vacancy! : null}
        history={{ count: agg._count._all, avg: Math.round(agg._avg.score ?? 0), recent: recent.map((r) => ({ id: r.id, question: r.question.text, score: r.score, date: fmt(r.createdAt) })) }}
        jobtoo={jt}
      />
    </>
  );
}
