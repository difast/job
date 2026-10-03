import { requirePageUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { EmptyState, LinkButton, PageHeader } from '@/components/ui';
import CoverLetterClient from '@/components/CoverLetterClient';
import type { LetterStyle } from '@/lib/types';

export default async function CoverLetterPage({ searchParams }: { searchParams: Promise<{ vacancy?: string }> }) {
  const user = await requirePageUser();
  const { vacancy } = await searchParams;
  const vacancies = await db.vacancy.findMany({
    where: { userId: user.id }, orderBy: { createdAt: 'desc' },
    include: { coverLetters: { orderBy: { createdAt: 'desc' }, take: 1 } },
  });
  return (
    <>
      <PageHeader title="Сопроводительное письмо" subtitle="Выберите вакансию — письмо учтёт ваше резюме, профессию и уровень." />
      {vacancies.length === 0 ? (
        <EmptyState icon="mail" title="Сначала добавьте вакансию" text="Письмо создаётся под конкретную вакансию. Вставьте её описание в разделе «Вакансии» — это займёт минуту."
          action={<LinkButton href="/vacancies" size="lg">Добавить вакансию</LinkButton>} />
      ) : (
        <CoverLetterClient
          key={vacancy ?? 'x'}
          initialId={vacancies.find((v) => v.id === vacancy)?.id ?? vacancies[0].id}
          vacancies={vacancies.map((v) => ({ id: v.id, title: v.title, matchScore: v.matchScore, letter: v.coverLetters[0] ? { id: v.coverLetters[0].id, text: v.coverLetters[0].text, style: v.coverLetters[0].style as LetterStyle } : null }))}
        />
      )}
    </>
  );
}
