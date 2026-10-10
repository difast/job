import Link from 'next/link';
import { requirePageUser } from '@/lib/auth';
import { latestResume } from '@/lib/context';
import { db } from '@/lib/db';
import { greeting } from '@/lib/format';
import { currentTier } from '@/lib/billing/plans';
import { LEVEL_SHORT, parseJson, type LevelKey, type ResumeAnalysis } from '@/lib/types';
import { Meter, ScoreRing, buttonClass, cx, scoreVerdict } from '@/components/ui';
import Icon, { type IconName } from '@/components/Icon';
import { ChangeGoalButton } from '@/components/GoalContext';
import ResumeUploader from '@/components/ResumeUploader';
import { ReanalyzeButton } from '@/components/ResumeActions';
import { AdaptButton } from '@/components/VacancyActions';

const plural = (n: number, one: string, few: string, many: string) => {
  const m10 = n % 10, m100 = n % 100;
  return `${n} ${m10 === 1 && m100 !== 11 ? one : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? few : many}`;
};

export default async function Dashboard() {
  const user = await requirePageUser();
  const [resume, vacancies, adaptations, letters, attempts, lastVacancy] = await Promise.all([
    latestResume(user.id),
    db.vacancy.count({ where: { userId: user.id } }),
    db.adaptation.count({ where: { vacancy: { userId: user.id } } }),
    db.coverLetter.count({ where: { vacancy: { userId: user.id } } }),
    db.practiceAttempt.count({ where: { userId: user.id } }),
    db.vacancy.findFirst({ where: { userId: user.id }, orderBy: { createdAt: 'desc' }, include: { adaptation: { select: { id: true } }, _count: { select: { coverLetters: true } } } }),
  ]);
  const a = resume ? parseJson<ResumeAnalysis>(resume.analysis, null as unknown as ResumeAnalysis) : null;
  const profession = user.profession!.name;
  const { tier, until } = currentTier(user);

  const stale = !!resume && (resume.professionId !== user.professionId || resume.level !== user.level);

  // Следующий шаг на пути «резюме → вакансия → адаптация → письмо → собеседование».
  // action: 'link' — кнопка открывает раздел; 'adapt' / 'reanalyze' — кнопка сразу выполняет действие.
  const next: { step: number; title: string; text: string; href: string; cta: string; icon: IconName; action?: 'adapt' | 'reanalyze' } | null =
    !resume ? null
    : stale ? { step: 1, icon: 'refresh', action: 'reanalyze', title: 'Обновите анализ резюме под новую цель', text: `Оценка сделана для прежней профессии или уровня. Пересчитаем её для «${profession}», ${LEVEL_SHORT[user.level as LevelKey]} — займёт несколько секунд.`, href: '/resume', cta: 'Обновить анализ' }
    : !lastVacancy ? { step: 2, icon: 'search', title: 'Проверьте резюме на реальной вакансии', text: 'Вставьте описание вакансии — покажем процент соответствия, сильные стороны и пробелы.', href: '/vacancies', cta: 'Проанализировать вакансию' }
    : !lastVacancy.adaptation ? { step: 3, icon: 'layers', action: 'adapt', title: `Адаптируйте резюме под «${lastVacancy.title}»`, text: `Соответствие сейчас ${lastVacancy.matchScore}%. Предложим правки формулировок — без выдуманных фактов.`, href: `/vacancies/${lastVacancy.id}`, cta: 'Адаптировать резюме' }
    : lastVacancy._count.coverLetters === 0 ? { step: 4, icon: 'mail', title: 'Подготовьте сопроводительное письмо', text: `Письмо под «${lastVacancy.title}» на основе вашего резюме — в одном из трёх стилей.`, href: `/cover-letter?vacancy=${lastVacancy.id}&create=1`, cta: 'Создать письмо' }
    : attempts === 0 ? { step: 5, icon: 'mic', title: 'Потренируйтесь перед собеседованием', text: `Вопросы для «${profession}», уровень ${LEVEL_SHORT[user.level as LevelKey]}. Ответьте — разберём ответ по ключевым пунктам.`, href: '/interview', cta: 'Начать тренировку' }
    : { step: 5, icon: 'briefcase', title: 'Всё готово к отклику', text: 'Проанализируйте следующую вакансию или продолжите тренировку собеседования.', href: '/vacancies', cta: 'Добавить вакансию' };

  const path: { href: string; icon: IconName; label: string; value: string; done: boolean }[] = [
    { href: '/resume', icon: 'file', label: 'Резюме', value: a ? `${a.score} / 100` : 'не загружено', done: !!a },
    { href: '/vacancies', icon: 'search', label: 'Анализ вакансий', value: vacancies ? String(vacancies) : '—', done: vacancies > 0 },
    { href: lastVacancy?.adaptation ? `/vacancies/${lastVacancy.id}/adapt` : lastVacancy ? `/vacancies/${lastVacancy.id}` : '/vacancies', icon: 'layers', label: 'Адаптация резюме', value: adaptations ? String(adaptations) : '—', done: adaptations > 0 },
    { href: '/cover-letter', icon: 'mail', label: 'Сопроводительные письма', value: letters ? String(letters) : '—', done: letters > 0 },
    { href: '/interview', icon: 'mic', label: 'Тренажёр собеседования', value: attempts ? plural(attempts, 'ответ', 'ответа', 'ответов') : '—', done: attempts > 0 },
  ];

  return (
    <>
      <header className="mb-8">
        <h1 className="text-[28px] font-semibold leading-tight tracking-[-0.025em] sm:text-[34px]">{greeting()}, {user.name.split(' ')[0]}</h1>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2 text-[15px] text-ink-2">
          <span data-testid="goal-line">Ваша цель: <b className="font-medium text-ink">{profession} · {LEVEL_SHORT[user.level as LevelKey]}</b></span>
          <ChangeGoalButton variant="ghost" />
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)] lg:gap-8">
        {/* Левая колонка: путь и статусы — как список разделов со счётчиками */}
        <aside className="order-2 space-y-4 lg:order-1">
          <nav aria-label="Ваш путь" className="rounded-2xl border border-line bg-white p-2.5">
            <h2 className="px-3 pb-1 pt-2.5 font-sans text-[13px] font-medium text-muted" style={{ letterSpacing: 0 }}>Ваш путь к отклику</h2>
            <ul>
              {path.map((p) => (
                <li key={p.label}>
                  <Link href={p.href} className="group flex h-12 items-center gap-3 rounded-xl px-3 transition-colors hover:bg-subtle" data-testid="path-row">
                    <span className={cx('flex h-7 w-7 shrink-0 items-center justify-center rounded-full', p.done ? 'bg-ink text-milk' : 'bg-stone text-ink-2')}>
                      <Icon name={p.done ? 'check' : p.icon} size={p.done ? 14 : 15} strokeWidth={p.done ? 2.4 : 1.7} />
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[15px]">{p.label}</span>
                    <span className={cx('tabular shrink-0 text-sm', p.done ? 'font-medium text-ink' : 'text-muted')}>{p.value}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          <Link href="/billing" className="group flex items-center gap-4 rounded-2xl border border-line bg-white p-5 transition-colors hover:border-line-strong">
            <div className="min-w-0 flex-1">
              <div className="text-[15px] font-medium">{tier === 'pro' ? 'Clymly Pro активен' : 'Clymly Pro — 499 ₽ в месяц'}</div>
              <div className="mt-0.5 text-sm text-ink-2">{tier === 'pro' && until ? `До ${until.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', timeZone: 'Europe/Moscow' })}` : 'Для активного поиска работы'}</div>
              <div className="mt-2.5 text-sm font-medium text-accent-600">{tier === 'pro' ? 'Управлять тарифом' : 'Подробнее'}</div>
            </div>
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-accent-50 text-accent-600 transition-colors group-hover:bg-accent-100"><Icon name="shield" size={20} /></span>
          </Link>
        </aside>

        {/* Основная колонка */}
        <div className="order-1 min-w-0 space-y-6 lg:order-2">
          {!resume || !a ? (
            <ResumeUploader goalLabel={profession} />
          ) : (
            <>
              {next && (
                <section className="rounded-2xl border border-line bg-white p-6 sm:p-7" data-testid="next-step">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="text-[13px] font-medium text-accent-600">Следующий шаг · {next.step} из 5</div>
                      <h2 className="mt-2 text-[22px] font-semibold leading-snug tracking-[-0.02em] sm:text-[26px]">{next.title}</h2>
                      <p className="mt-2 max-w-[560px] text-[15px] leading-relaxed text-ink-2">{next.text}</p>
                    </div>
                    <span className="hidden h-12 w-12 shrink-0 items-center justify-center rounded-full bg-stone text-ink sm:flex"><Icon name={next.icon} size={20} /></span>
                  </div>
                  <div className="mt-6">
                    {next.action === 'reanalyze' ? <ReanalyzeButton size="lg" label={next.cta} className="w-full" />
                      : next.action === 'adapt' && lastVacancy ? <AdaptButton id={lastVacancy.id} hasAdaptation={false} />
                      : <Link href={next.href} className={buttonClass({ size: 'lg', className: 'w-full' })}>{next.cta}<Icon name="arrow-right" size={16} /></Link>}
                  </div>
                  {next.action === 'adapt' && lastVacancy && <Link href={`/vacancies/${lastVacancy.id}`} className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-ink-2 hover:text-ink">Сначала посмотреть анализ вакансии<Icon name="arrow-right" size={14} /></Link>}
                </section>
              )}

              <section className="rounded-2xl border border-line bg-white" aria-labelledby="score-h">
                <div className="flex items-center justify-between gap-3 border-b border-line px-6 py-4">
                  <div className="min-w-0"><h2 id="score-h" className="text-[17px] font-semibold tracking-[-0.01em]">Оценка резюме</h2><div className="truncate text-[13px] text-muted" data-testid="resume-file-name">{resume.fileName}{stale ? ' · оценка для прежней цели' : ''}</div></div>
                  <Link href="/resume" className="inline-flex shrink-0 items-center gap-1 text-sm font-medium text-accent-600 hover:text-accent-700">Полный анализ<Icon name="arrow-right" size={14} /></Link>
                </div>
                <div className="flex flex-col gap-7 px-6 py-6 sm:flex-row sm:items-center sm:gap-10">
                  <div className="flex items-center gap-5 sm:block sm:text-center" data-testid="resume-score">
                    <ScoreRing value={a.score} size={120} stroke={8} />
                    <div className="text-sm font-medium sm:mt-2.5">{scoreVerdict(a.score)}</div>
                  </div>
                  <div className="grid flex-1 gap-x-10 gap-y-4 sm:grid-cols-2">
                    <Meter label="Структура" value={a.breakdown.structure} />
                    <Meter label="Опыт" value={a.breakdown.experience} />
                    <Meter label="Навыки" value={a.breakdown.skills} />
                    <Meter label="Достижения" value={a.breakdown.achievements} />
                  </div>
                </div>
                <div className="border-t border-line px-6 py-5">
                  <h3 className="font-sans text-[13px] font-medium text-muted" style={{ letterSpacing: 0 }}>Что улучшить в первую очередь</h3>
                  <ol className="mt-3 divide-y divide-line">
                    {a.improvements.slice(0, 3).map((it, i) => (
                      <li key={i} className="flex gap-3 py-3 first:pt-1 last:pb-0">
                        <span className="tabular mt-0.5 w-5 shrink-0 text-sm font-semibold text-accent-600">{i + 1}</span>
                        <div className="min-w-0"><div className="text-[15px] font-medium">{it.title}</div><p className="mt-0.5 line-clamp-2 text-sm text-ink-2">{it.detail}</p></div>
                      </li>
                    ))}
                  </ol>
                </div>
              </section>
            </>
          )}
        </div>
      </div>
    </>
  );
}
