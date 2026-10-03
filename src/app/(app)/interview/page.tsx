import { requirePageUser } from '@/lib/auth';
import { LEVEL_SHORT, type LevelKey } from '@/lib/types';
import { PageHeader } from '@/components/ui';
import InterviewClient from '@/components/InterviewClient';

export default async function InterviewPage() {
  const user = await requirePageUser();
  return (
    <>
      <PageHeader title="Подготовка к собеседованию"
        subtitle={<span>Вопросы для цели <b className="font-medium text-ink">{user.profession!.name} · {LEVEL_SHORT[user.level as LevelKey]}</b>. Отвечайте письменно — разберём ответ по ключевым пунктам.</span>} />
      <InterviewClient />
    </>
  );
}
