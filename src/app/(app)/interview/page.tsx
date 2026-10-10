import { requirePageUser } from '@/lib/auth';
import { LEVEL_SHORT, type LevelKey } from '@/lib/types';
import InterviewClient from '@/components/InterviewClient';
import { ChangeGoalButton } from '@/components/GoalContext';

export default async function InterviewPage() {
  const user = await requirePageUser();
  return (
    <>
      <header className="mx-auto mb-8 max-w-[820px]">
        <h1 className="text-[28px] font-semibold leading-[1.15] tracking-[-0.025em] sm:text-[32px]">Подготовка к собеседованию</h1>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[15px] text-ink-2">
          <span>Вопросы для <b className="font-medium text-ink">{user.profession!.name} · {LEVEL_SHORT[user.level as LevelKey]}</b></span>
          <ChangeGoalButton variant="ghost" />
        </div>
      </header>
      <InterviewClient />
    </>
  );
}
