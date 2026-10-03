import { requirePageUser } from '@/lib/auth';
import { PageHeader } from '@/components/ui';
import InterviewClient from '@/components/InterviewClient';
import { LEVEL_LABELS, type LevelKey } from '@/lib/types';

export default async function InterviewPage() {
  const user = await requirePageUser();
  return (
    <>
      <PageHeader title="Собеседование" subtitle="Банк вопросов для вашей профессии и уровня и тренажёр: отвечайте письменно и получайте разбор по ключевым пунктам." />
      <InterviewClient professionName={user.profession!.name} levelLabel={LEVEL_LABELS[user.level as LevelKey]} />
    </>
  );
}
