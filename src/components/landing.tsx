import Link from 'next/link';
import Icon, { type IconName } from './Icon';
import { Logo, LinkButton, Meter, ScoreRing, cx } from './ui';

const wrap = 'mx-auto w-full max-w-6xl px-5 sm:px-8';

/* ───────── Шапка ───────── */
export function LandingHeader({ signedIn }: { signedIn: boolean }) {
  return (
    <header className="sticky top-0 z-30 border-b border-line/70 bg-canvas/85 backdrop-blur-md">
      <div className={cx(wrap, 'flex h-16 items-center justify-between gap-4')}>
        <Link href="/" aria-label="Карьерный навигатор — на главную"><Logo /></Link>
        <nav aria-label="Разделы" className="hidden items-center gap-7 text-sm text-ink-2 md:flex">
          <a href="#features" className="transition-colors hover:text-ink">Возможности</a>
          <a href="#how" className="transition-colors hover:text-ink">Как это работает</a>
          <a href="#professions" className="transition-colors hover:text-ink">Профессии</a>
        </nav>
        <div className="flex items-center gap-2">
          {signedIn ? (
            <LinkButton href="/dashboard" size="sm">Личный кабинет</LinkButton>
          ) : (
            <>
              <LinkButton href="/login" variant="ghost" size="sm">Войти</LinkButton>
              <LinkButton href="/register" size="sm" className="hidden sm:inline-flex">Попробовать бесплатно</LinkButton>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

/* ───────── Превью продукта (макет интерфейса, без стоковых картинок) ───────── */
function MiniCard({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cx('rounded-xl border border-line bg-white p-4 shadow-[0_1px_2px_rgba(14,17,32,0.04),0_8px_24px_-12px_rgba(14,17,32,0.12)]', className)}>{children}</div>;
}

export function ProductPreview() {
  return (
    <div aria-hidden="true" className="relative select-none">
      <div className="rounded-2xl border border-line bg-subtle/80 p-3 sm:p-4">
        <div className="mb-3 flex items-center gap-1.5 px-1">
          <span className="h-2 w-2 rounded-full bg-line-strong" /><span className="h-2 w-2 rounded-full bg-line-strong" /><span className="h-2 w-2 rounded-full bg-line-strong" />
          <span className="ml-3 rounded-md bg-white px-2.5 py-0.5 text-[11px] text-muted">Product Manager · Middle</span>
        </div>
        <div className="grid gap-3">
          <MiniCard>
            <div className="flex items-center gap-5">
              <ScoreRing value={78} size={96} stroke={7} />
              <div className="grid flex-1 gap-2.5">
                <div className="text-[11px] font-medium uppercase tracking-wider text-muted">Оценка резюме</div>
                <Meter label="Структура" value={92} />
                <Meter label="Опыт" value={81} />
                <Meter label="Навыки" value={74} />
                <Meter label="Достижения" value={65} />
              </div>
            </div>
          </MiniCard>
          <div className="grid gap-3 sm:grid-cols-2">
            <MiniCard>
              <div className="flex items-baseline gap-2"><span className="tabular text-3xl font-semibold tracking-tight text-ok">84%</span><span className="text-xs text-muted">соответствие вакансии</span></div>
              <ul className="mt-3 space-y-2 text-[13px]">
                <li className="flex items-center gap-2"><Icon name="check" size={14} className="text-ok" />Опыт от 3 лет</li>
                <li className="flex items-center gap-2"><Icon name="check" size={14} className="text-ok" />A/B-тесты</li>
                <li className="flex items-center gap-2 text-ink-2"><Icon name="alert" size={14} className="text-warn" />SQL — усилить</li>
              </ul>
            </MiniCard>
            <MiniCard>
              <div className="text-[11px] font-medium uppercase tracking-wider text-muted">Что улучшить</div>
              <ul className="mt-3 space-y-2.5 text-[13px] leading-snug">
                <li className="flex gap-2"><span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-warn-soft text-[10px] font-semibold text-warn">1</span>Добавьте цифры к результатам</li>
                <li className="flex gap-2"><span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-warn-soft text-[10px] font-semibold text-warn">2</span>Выделите блок «Навыки»</li>
              </ul>
            </MiniCard>
          </div>
          <MiniCard className="sm:ml-10">
            <div className="flex items-center justify-between text-[11px] text-muted"><span className="font-medium uppercase tracking-wider">Собеседование · Вопрос 3 из 20</span><span>Профессиональное</span></div>
            <p className="mt-2.5 text-sm font-medium leading-snug">Как вы определяете приоритеты продукта?</p>
            <div className="mt-3 flex flex-wrap gap-1.5 text-[11px]">
              <span className="rounded-md bg-ok-soft px-2 py-0.5 text-ok">Фреймворки RICE</span>
              <span className="rounded-md bg-ok-soft px-2 py-0.5 text-ok">Связь с целями</span>
              <span className="rounded-md bg-subtle px-2 py-0.5 text-ink-2">Метрики успеха</span>
            </div>
          </MiniCard>
        </div>
      </div>
    </div>
  );
}

/* ───────── Hero ───────── */
export function Hero({ signedIn }: { signedIn: boolean }) {
  return (
    <section className={cx(wrap, 'grid items-center gap-12 py-14 sm:py-20 lg:grid-cols-[1fr_1.02fr] lg:gap-16 lg:py-24')}>
      <div className="page-in">
        <h1 className="text-[2.25rem] font-semibold leading-[1.1] tracking-[-0.03em] sm:text-[2.75rem] lg:text-[3.1rem]">
          <span className="block">Подготовьте резюме.</span>
          <span className="block">Подготовьтесь к собеседованию.</span>
          <span className="block text-accent-600">Получите работу.</span>
        </h1>
        <p className="mt-6 max-w-xl text-[17px] leading-relaxed text-ink-2">
          AI-платформа, которая помогает улучшить резюме, адаптировать его под конкретные вакансии, создавать сопроводительные письма и готовиться к собеседованиям.
        </p>
        <div className="mt-9 flex flex-wrap items-center gap-3">
          <LinkButton href={signedIn ? '/dashboard' : '/register'} size="lg">{signedIn ? 'Открыть кабинет' : 'Попробовать бесплатно'}<Icon name="arrow-right" size={16} /></LinkButton>
          {!signedIn && <LinkButton href="/login" variant="secondary" size="lg">Войти</LinkButton>}
        </div>
        <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-[13px] text-muted">
          <li className="flex items-center gap-1.5"><Icon name="check" size={14} className="text-ok" />Без банковской карты</li>
          <li className="flex items-center gap-1.5"><Icon name="shield" size={14} className="text-ok" />Не выдумываем факты о вас</li>
        </ul>
      </div>
      <div className="page-in" style={{ animationDelay: '80ms' }}><ProductPreview /></div>
    </section>
  );
}

/* ───────── Как это работает ───────── */
const STEPS = [
  { n: '01', t: 'Выберите профессию', d: 'Укажите желаемую должность и уровень.' },
  { n: '02', t: 'Загрузите резюме', d: 'Получите анализ и конкретные рекомендации по улучшению.' },
  { n: '03', t: 'Подготовьтесь к вакансии', d: 'Адаптируйте резюме, создайте сопроводительное письмо и потренируйтесь проходить собеседование.' },
];

export function HowItWorks() {
  return (
    <section id="how" className={cx(wrap, 'scroll-mt-20 py-16 sm:py-20')}>
      <h2 className="text-[28px] font-semibold tracking-tight sm:text-[32px]">Как это работает</h2>
      <ol className="mt-10 grid gap-10 md:grid-cols-3 md:gap-8">
        {STEPS.map((s) => (
          <li key={s.n} className="border-t border-ink pt-5">
            <span className="tabular text-sm font-medium text-accent-600">{s.n}</span>
            <h3 className="mt-3 text-lg font-semibold tracking-tight">{s.t}</h3>
            <p className="mt-2 text-[15px] leading-relaxed text-ink-2">{s.d}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

/* ───────── Возможности ───────── */
const FEATURES: { icon: IconName; t: string; d: string }[] = [
  { icon: 'file', t: 'Анализ резюме', d: 'Получите оценку резюме и конкретные рекомендации по улучшению.' },
  { icon: 'layers', t: 'Резюме под вакансию', d: 'Проверьте соответствие требованиям и адаптируйте резюме под конкретную вакансию.' },
  { icon: 'mail', t: 'Сопроводительное письмо', d: 'Создайте профессиональное письмо на основе вашего резюме и вакансии.' },
  { icon: 'mic', t: 'Подготовка к собеседованию', d: 'Тренируйтесь отвечать на вопросы для вашей профессии и уровня.' },
];

export function Features() {
  return (
    <section id="features" className="scroll-mt-20 border-y border-line bg-white">
      <div className={cx(wrap, 'py-16 sm:py-20')}>
        <h2 className="text-[28px] font-semibold tracking-tight sm:text-[32px]">Всё для отклика — в одном месте</h2>
        <div className="mt-10 grid gap-x-12 gap-y-10 sm:grid-cols-2">
          {FEATURES.map((f) => (
            <div key={f.t} className="flex gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent-50 text-accent-600"><Icon name={f.icon} size={19} /></div>
              <div>
                <h3 className="text-[17px] font-semibold tracking-tight">{f.t}</h3>
                <p className="mt-1.5 text-[15px] leading-relaxed text-ink-2">{f.d}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ───────── Профессии ───────── */
const PROFESSIONS = ['Продакт-менеджер', 'Маркетолог', 'Финансовый аналитик', 'Юрист', 'Бухгалтер', 'HR-менеджер', 'Инженер', 'Аналитик данных', 'Менеджер по продажам', 'Дизайнер', 'Проектный менеджер', 'Архитектор'];

export function Professions() {
  return (
    <section id="professions" className={cx(wrap, 'scroll-mt-20 py-16 sm:py-20')}>
      <div className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:gap-16">
        <div>
          <h2 className="text-[28px] font-semibold tracking-tight sm:text-[32px]">Для разных профессий и уровней</h2>
          <p className="mt-4 max-w-md text-[15px] leading-relaxed text-ink-2">
            Выберите профессию и уровень — рекомендации, вопросы для собеседования и анализ резюме будут адаптированы под вашу цель.
          </p>
          <p className="mt-6 flex flex-wrap gap-2 text-[13px]">
            {['Junior', 'Middle', 'Senior', 'Lead'].map((l) => <span key={l} className="rounded-md bg-accent-50 px-2.5 py-1 font-medium text-accent-700">{l}</span>)}
          </p>
        </div>
        <ul className="flex flex-wrap content-start gap-2.5">
          {PROFESSIONS.map((p) => <li key={p} className="rounded-lg border border-line bg-white px-3.5 py-2 text-sm font-medium text-ink-2 shadow-card">{p}</li>)}
          <li className="rounded-lg border border-dashed border-line-strong px-3.5 py-2 text-sm text-muted">и ещё 26 профессий</li>
        </ul>
      </div>
    </section>
  );
}

/* ───────── Финальный призыв ───────── */
export function FinalCta({ signedIn }: { signedIn: boolean }) {
  return (
    <section className={cx(wrap, 'pb-16 sm:pb-24')}>
      <div className="rounded-2xl bg-ink px-6 py-12 text-center sm:px-12 sm:py-16">
        <h2 className="mx-auto max-w-xl text-[26px] font-semibold leading-tight tracking-tight text-white sm:text-[32px]">Готовы подготовиться к поиску работы?</h2>
        <p className="mx-auto mt-3 max-w-md text-[15px] text-[#aab0c5]">Начните с анализа своего резюме.</p>
        <div className="mt-8">
          <Link href={signedIn ? '/dashboard' : '/register'} className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-white px-6 text-[15px] font-medium text-ink transition-colors hover:bg-accent-50">
            {signedIn ? 'Открыть кабинет' : 'Попробовать бесплатно'}<Icon name="arrow-right" size={16} />
          </Link>
        </div>
      </div>
    </section>
  );
}

/* ───────── Футер ───────── */
export function LandingFooter() {
  const links: [string, string][] = [['Возможности', '/#features'], ['Войти', '/login'], ['Регистрация', '/register'], ['Условия использования', '/terms'], ['Политика конфиденциальности', '/privacy']];
  return (
    <footer className="border-t border-line bg-white">
      <div className={cx(wrap, 'flex flex-col gap-6 py-8 md:flex-row md:items-center md:justify-between')}>
        <div className="flex flex-col gap-1.5">
          <Logo size={24} className="text-[15px]" />
          <span className="text-[13px] text-muted">© {new Date().getFullYear()} Карьерный навигатор</span>
        </div>
        <nav aria-label="Нижнее меню"><ul className="flex flex-wrap gap-x-6 gap-y-2 text-[13px] text-ink-2">
          {links.map(([t, h]) => <li key={t}><Link href={h} className="transition-colors hover:text-ink">{t}</Link></li>)}
        </ul></nav>
      </div>
    </footer>
  );
}
