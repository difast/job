import Link from 'next/link';
import { requirePageUser } from '@/lib/auth';
import { latestResume } from '@/lib/context';
import { db } from '@/lib/db';
import { relativeDay } from '@/lib/format';
import { PageHeader, cx, scoreTone } from '@/components/ui';
import Icon from '@/components/Icon';
import VacancyForm from '@/components/VacancyForm';

const STEPS = ['Вставьте описание', 'Сравним с резюме', 'Адаптируем резюме'];

export default async function VacanciesPage() {
  const user = await requirePageUser();
  const [resume, vacancies] = await Promise.all([
    latestResume(user.id),
    db.vacancy.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'desc' }, include: { adaptation: { select: { id: true } } } }),
  ]);
  return (
    <>
      <PageHeader title="Анализ вакансии" subtitle="Покажем, насколько вы соответствуете требованиям, и подскажем, как усилить резюме без выдуманных фактов." />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-8">
        <div className="min-w-0">
          <ol className="mb-4 flex flex-wrap items-center gap-x-2 gap-y-2 text-[13px] text-ink-2" aria-label="Как это работает">
            {STEPS.map((s, i) => (
              <li key={s} className="flex items-center gap-2">
                <span className={cx('flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-semibold', i === 0 ? 'bg-ink text-milk' : 'bg-stone text-ink-2')}>{i + 1}</span>{s}
                {i < STEPS.length - 1 && <Icon name="chevron-right" size={14} className="text-muted" />}
              </li>
            ))}
          </ol>
          <VacancyForm hasResume={!!resume} />
        </div>

        <aside aria-labelledby="hist" className="lg:sticky lg:top-24 lg:self-start">
          <div className="rounded-2xl border border-line bg-white">
            <h2 id="hist" className="border-b border-line px-5 py-4 text-[17px] font-semibold tracking-[-0.01em]">Ваши вакансии{vacancies.length > 0 && <span className="tabular ml-2 font-sans text-sm font-normal text-muted">{vacancies.length}</span>}</h2>
            {vacancies.length === 0 ? (
              <p className="px-5 py-5 text-sm leading-relaxed text-muted">Здесь появятся проанализированные вакансии — к ним можно вернуться, чтобы адаптировать резюме или написать письмо.</p>
            ) : (
              <ul className="max-h-[560px] divide-y divide-line overflow-y-auto">
                {vacancies.map((v) => (
                  <li key={v.id}>
                    <Link href={`/vacancies/${v.id}`} className="group relative flex items-start gap-3 px-5 py-4 transition-colors hover:bg-canvas">
                      {v.adaptation && <span aria-hidden="true" className="absolute inset-y-3 left-0 w-[3px] rounded-r bg-accent-500" />}
                      <div className="min-w-0 flex-1">
                        <div className="user-text line-clamp-2 text-[15px] font-medium leading-snug">{v.title}</div>
                        <div className="mt-1 text-[13px] text-muted">{relativeDay(v.createdAt)}{v.adaptation ? ' · резюме адаптировано' : ''}</div>
                      </div>
                      <span className={`tabular shrink-0 text-[17px] font-semibold ${scoreTone(v.matchScore)}`}>{v.matchScore}%</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>
      </div>
    </>
  );
}
