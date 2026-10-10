import Link from 'next/link';
import Icon from './Icon';
import { Logo, Meter, ScoreRing, cx } from './ui';

export { default as LandingHeader } from './LandingHeader';

const wrap = 'mx-auto w-full max-w-[1240px] px-5 sm:px-8';
const ACCENT = '#b4472a';
const GRAPHITE = '#2f2b27';

/* ───────── Фрагменты интерфейса продукта (реальные экраны, без стока) ───────── */
function Panel({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cx('rounded-2xl border border-[#e8e1d6] bg-milk p-4 text-ink shadow-[0_1px_2px_rgba(28,26,23,0.06),0_24px_48px_-24px_rgba(28,26,23,0.45)] sm:p-5', className)}>{children}</div>;
}

const Label = ({ children }: { children: React.ReactNode }) => <div className="shrink-0 whitespace-nowrap text-[11px] font-medium uppercase tracking-[0.08em] text-muted">{children}</div>;

function ResumeScorePanel({ className }: { className?: string }) {
  return (
    <Panel className={className}>
      <div className="flex items-center justify-between gap-3"><Label>Оценка резюме</Label><span className="min-w-0 truncate text-[11px] text-muted">Продакт-менеджер · Middle</span></div>
      <div className="mt-4 flex items-center gap-5">
        <ScoreRing value={78} size={92} stroke={7} color={ACCENT} />
        <div className="grid flex-1 gap-2.5 text-ink">
          <Meter label="Структура" value={92} color={GRAPHITE} />
          <Meter label="Опыт" value={81} color={GRAPHITE} />
          <Meter label="Навыки" value={74} color={GRAPHITE} />
          <Meter label="Достижения" value={65} color={ACCENT} />
        </div>
      </div>
    </Panel>
  );
}

function MatchPanel({ className }: { className?: string }) {
  return (
    <Panel className={className}>
      <Label>Соответствие вакансии</Label>
      <div className="font-display mt-2 text-[40px] font-semibold leading-none tracking-[-0.04em] text-ink">84<span className="text-accent-600">%</span></div>
      <ul className="mt-3.5 space-y-2 text-[13px] text-ink">
        <li className="flex items-center gap-2"><Icon name="check" size={14} strokeWidth={2.2} className="text-ink" />Опыт от 3 лет</li>
        <li className="flex items-center gap-2"><Icon name="check" size={14} strokeWidth={2.2} className="text-ink" />A/B-тесты и метрики</li>
        <li className="flex items-center gap-2 text-ink-2"><Icon name="alert" size={14} className="text-accent-600" />SQL — стоит усилить</li>
      </ul>
    </Panel>
  );
}

function QuestionPanel({ className }: { className?: string }) {
  return (
    <Panel className={className}>
      <div className="flex items-center justify-between gap-3"><Label>Вопрос 3 из 12</Label><span className="min-w-0 truncate text-[11px] text-muted">Профессиональное</span></div>
      <p className="font-display mt-2.5 text-[15px] font-medium leading-snug text-ink">Как вы определяете приоритеты продукта?</p>
      <div className="mt-3 flex flex-wrap gap-1.5 text-[11px]">
        <span className="rounded-full bg-ink px-2.5 py-1 text-milk">RICE ✓</span>
        <span className="rounded-full bg-ink px-2.5 py-1 text-milk">Цели и метрики ✓</span>
        <span className="rounded-full bg-accent-50 px-2.5 py-1 text-accent-700">Стейкхолдеры</span>
      </div>
    </Panel>
  );
}

/** Превью для страниц входа/регистрации (вертикальная стопка). */
export function ProductPreview() {
  return (
    <div aria-hidden="true" className="grid select-none gap-3">
      <ResumeScorePanel />
      <div className="grid gap-3 sm:grid-cols-2"><MatchPanel /><QuestionPanel /></div>
    </div>
  );
}

/* ───────── Первый экран ───────── */
function HeroBands() {
  return (
    <svg aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 1400 720" preserveAspectRatio="xMidYMid slice" fill="none">
      <path d="M640 -120 C 840 150, 1080 250, 1520 210" stroke="#b4472a" strokeWidth="170" strokeLinecap="round" />
      <path d="M860 860 C 960 560, 1190 500, 1540 560" stroke="#5b2321" strokeWidth="190" strokeLinecap="round" />
      <path d="M-160 700 C 160 600, 420 690, 640 860" stroke="#b4472a" strokeWidth="120" strokeLinecap="round" opacity="0.28" />
      <path d="M780 -40 C 640 190, 930 320, 840 520 S 1000 780, 1160 740" stroke="#fbf9f5" strokeWidth="2" opacity="0.28" />
    </svg>
  );
}

export function Hero({ signedIn }: { signedIn: boolean }) {
  return (
    <section className="px-3 pt-1 sm:px-5">
      <div className="relative mx-auto max-w-[1400px] overflow-hidden rounded-[28px] bg-graphite text-milk sm:rounded-[40px]">
        <HeroBands />
        <div aria-hidden="true" className="absolute inset-0 bg-[linear-gradient(90deg,#22201d_0%,rgba(34,32,29,0.92)_38%,rgba(34,32,29,0.35)_62%,rgba(34,32,29,0)_80%)]" />
        <div className="relative grid gap-12 px-6 pb-10 pt-12 sm:px-12 sm:pb-14 sm:pt-16 lg:grid-cols-[1.15fr_0.85fr] lg:items-center lg:gap-10 lg:px-14 lg:py-20 xl:px-20">
          <div className="page-in">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/8 px-3.5 py-1.5 text-[13px] text-milk/80">
              <span className="h-1.5 w-1.5 rounded-full bg-accent-300" />38 профессий · от Junior до Lead
            </span>
            <h1 className="font-display mt-7 text-[38px] font-semibold leading-[1.03] tracking-[-0.035em] sm:text-[54px] lg:text-[52px] xl:text-[62px]">
              <span className="block">Подготовьте резюме.</span>
              <span className="block">Подготовьтесь к&nbsp;собеседованию.</span>
              <span className="block text-accent-300">Получите работу.</span>
            </h1>
            <p className="mt-7 max-w-[520px] text-[17px] leading-relaxed text-milk/70 sm:text-[18px]">
              Сервис анализирует и улучшает резюме, адаптирует его под вакансии, пишет сопроводительные письма и помогает подготовиться к интервью — под вашу профессию и уровень.
            </p>
            <div className="mt-9 flex flex-wrap items-center gap-3">
              <Link href={signedIn ? '/dashboard' : '/register'} className="inline-flex h-14 w-full items-center justify-center gap-2.5 rounded-full bg-accent-600 px-7 text-[16px] font-semibold text-white shadow-[0_8px_24px_-10px_rgba(180,71,42,0.9)] transition-colors hover:bg-accent-500 sm:w-auto">
                {signedIn ? 'Открыть кабинет' : 'Попробовать бесплатно'}<Icon name="arrow-right" size={18} />
              </Link>
              {!signedIn && <Link href="/login" className="inline-flex h-14 w-full items-center justify-center rounded-full border border-white/18 px-7 text-[16px] font-medium text-milk transition-colors hover:bg-white/8 sm:w-auto">Войти</Link>}
            </div>
            <p className="mt-6 text-[13px] text-milk/45">Бесплатно и без банковской карты</p>
          </div>

          <div aria-hidden="true" className="page-in relative select-none" style={{ animationDelay: '90ms' }}>
            {/* desktop: композиция из реальных экранов продукта */}
            <div className="relative mx-auto hidden h-[470px] max-w-[460px] lg:block">
              <ResumeScorePanel className="absolute left-0 right-0 top-0 -rotate-[1.5deg]" />
              <MatchPanel className="absolute left-[-32px] top-[214px] w-[218px] rotate-[2deg]" />
              <QuestionPanel className="absolute right-[-12px] top-[262px] w-[262px] -rotate-[1deg]" />
            </div>
            {/* mobile/tablet: аккуратная стопка */}
            <div className="grid gap-3 sm:grid-cols-2 lg:hidden">
              <ResumeScorePanel className="sm:col-span-2" />
              <MatchPanel />
              <QuestionPanel />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ───────── Возможности: редакционный список вместо сетки карточек ───────── */
const FEATURES: { t: string; d: string; tag: string }[] = [
  { t: 'Анализ резюме', d: 'Оценка по шести критериям — структура, опыт, достижения, навыки, соответствие профессии и ATS — и конкретные рекомендации.', tag: '78 / 100' },
  { t: 'Резюме под вакансию', d: 'Сравниваем резюме с требованиями и предлагаем правки формулировок. Каждую можно принять, отклонить или отредактировать.', tag: '84% соответствия' },
  { t: 'Сопроводительное письмо', d: 'Письмо на основе вашего резюме и конкретной вакансии — в профессиональном, кратком или персональном стиле.', tag: '3 стиля' },
  { t: 'Подготовка к собеседованию', d: 'Вопросы для вашей профессии и уровня, тренажёр ответов и разбор: что хорошо, что улучшить, как усилить ответ.', tag: 'HR · Проф. · Руководитель' },
];

export function Features() {
  return (
    <section id="features" className={cx(wrap, 'scroll-mt-20 py-20 sm:py-28')}>
      <div className="grid gap-12 lg:grid-cols-[0.82fr_1.18fr] lg:gap-20">
        <div className="lg:sticky lg:top-28 lg:self-start">
          <div className="text-[13px] font-medium uppercase tracking-[0.1em] text-accent-600">Возможности</div>
          <h2 className="font-display mt-4 text-[34px] font-semibold leading-[1.08] tracking-[-0.03em] sm:text-[44px]">Четыре инструмента — один сильный отклик</h2>
          <p className="mt-5 max-w-[420px] text-[16px] leading-relaxed text-ink-2">Всё строится на вашем реальном опыте: сервис улучшает формулировки, но не придумывает должности, компании и навыки.</p>
        </div>
        <ol className="border-t border-ink">
          {FEATURES.map((f, i) => (
            <li key={f.t} className="group grid grid-cols-[44px_1fr] gap-x-4 border-b border-line-strong py-7 sm:grid-cols-[64px_1fr_auto] sm:gap-x-6 sm:py-8">
              <span className="font-display pt-1 text-[15px] font-medium text-accent-600 sm:text-[17px]">0{i + 1}</span>
              <div>
                <h3 className="font-display text-[22px] font-semibold tracking-[-0.02em] sm:text-[26px]">{f.t}</h3>
                <p className="mt-2 max-w-[520px] text-[15px] leading-relaxed text-ink-2">{f.d}</p>
              </div>
              <span className="col-start-2 mt-4 w-fit self-start whitespace-nowrap rounded-full border border-line-strong bg-milk px-3 py-1 text-[13px] text-ink-2 sm:col-start-3 sm:mt-1.5">{f.tag}</span>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

/* ───────── Как это работает ───────── */
const STEPS = [
  { t: 'Выберите профессию', d: 'Укажите желаемую должность и уровень — от Junior до руководителя.' },
  { t: 'Загрузите резюме', d: 'PDF или DOCX. Получите оценку и конкретные рекомендации по улучшению.' },
  { t: 'Подготовьтесь к вакансии', d: 'Адаптируйте резюме, создайте письмо и потренируйтесь отвечать на вопросы.' },
];

export function HowItWorks() {
  return (
    <section id="how" className="scroll-mt-20 px-3 sm:px-5">
      <div className="mx-auto max-w-[1400px] rounded-[28px] bg-stone sm:rounded-[40px]">
        <div className={cx(wrap, 'py-16 sm:py-24')}>
          <div className="flex flex-wrap items-end justify-between gap-6">
            <h2 className="font-display text-[34px] font-semibold leading-[1.08] tracking-[-0.03em] sm:text-[44px]">Как это работает</h2>
            <p className="max-w-[340px] text-[15px] text-ink-2">Три шага — и у вас готовы резюме, письмо и ответы на вопросы.</p>
          </div>
          <ol className="mt-12 grid gap-10 md:mt-16 md:grid-cols-3 md:gap-0">
            {STEPS.map((s, i) => (
              <li key={s.t} className={cx('md:px-8', i === 0 && 'md:pl-0', i > 0 && 'md:border-l md:border-[#d6cdbf]')}>
                <span className="font-display block text-[64px] font-semibold leading-none tracking-[-0.05em] text-accent-600 sm:text-[80px]">0{i + 1}</span>
                <h3 className="font-display mt-6 text-[21px] font-semibold tracking-[-0.02em]">{s.t}</h3>
                <p className="mt-2 max-w-[300px] text-[15px] leading-relaxed text-ink-2">{s.d}</p>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}

/* ───────── Профессии: крупное «заявление» ───────── */
const PROFESSIONS = ['Продакт-менеджер', 'Маркетолог', 'Финансовый аналитик', 'Юрист', 'Бухгалтер', 'HR-менеджер', 'Инженер', 'Аналитик данных', 'Менеджер по продажам', 'Дизайнер', 'Проектный менеджер', 'Архитектор'];

export function Professions({ signedIn }: { signedIn: boolean }) {
  return (
    <section id="professions" className={cx(wrap, 'scroll-mt-20 py-20 text-center sm:py-28')}>
      <div className="font-display text-[132px] font-semibold leading-[0.82] tracking-[-0.06em] sm:text-[200px] lg:text-[240px]" aria-hidden="true">38</div>
      <h2 className="font-display mx-auto mt-6 max-w-[760px] text-[32px] font-semibold leading-[1.1] tracking-[-0.03em] sm:text-[46px]">
        профессий и четыре уровня —{' '}<span className="whitespace-nowrap text-accent-600">не только IT</span>
      </h2>
      <p className="mx-auto mt-5 max-w-[560px] text-[16px] leading-relaxed text-ink-2">
        Выберите профессию и уровень — рекомендации, вопросы для собеседования и анализ резюме будут адаптированы под вашу цель.
      </p>
      <ul className="mx-auto mt-10 flex max-w-[880px] flex-wrap justify-center gap-2.5">
        {PROFESSIONS.map((p) => <li key={p} className="rounded-full border border-line-strong bg-milk px-4 py-2 text-[15px] text-ink">{p}</li>)}
        <li className="rounded-full border border-dashed border-line-strong px-4 py-2 text-[15px] text-muted">и ещё 26</li>
      </ul>
      <p className="mt-6 text-[14px] text-muted">Junior · Middle · Senior · Lead</p>
      <Link href={signedIn ? '/dashboard' : '/register'} className="mt-10 inline-flex h-14 items-center gap-2.5 rounded-full bg-ink px-7 text-[16px] font-medium text-milk transition-colors hover:bg-black">
        Выбрать свою профессию<Icon name="arrow-right" size={18} />
      </Link>
    </section>
  );
}

/* ───────── Финальный призыв ───────── */
export function FinalCta({ signedIn }: { signedIn: boolean }) {
  return (
    <section className="px-3 pb-3 sm:px-5 sm:pb-5">
      <div className="relative mx-auto max-w-[1400px] overflow-hidden rounded-[28px] bg-accent-600 sm:rounded-[40px]">
        <svg aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 1400 520" preserveAspectRatio="xMidYMid slice" fill="none">
          <path d="M980 620 C 1060 380, 1240 320, 1520 360" stroke="#933720" strokeWidth="150" strokeLinecap="round" />
          <path d="M-120 -40 C 120 90, 300 40, 460 -120" stroke="#c95a37" strokeWidth="120" strokeLinecap="round" />
          <path d="M900 -30 C 820 160, 1080 260, 1010 560" stroke="#fbf9f5" strokeWidth="2" opacity="0.3" />
        </svg>
        <div className={cx(wrap, 'relative py-16 sm:py-24')}>
          <h2 className="font-display max-w-[720px] text-[36px] font-semibold leading-[1.04] tracking-[-0.035em] text-white sm:text-[56px]">Готовы подготовиться к поиску работы?</h2>
          <p className="mt-5 text-[18px] text-white/80">Начните с анализа своего резюме.</p>
          <Link href={signedIn ? '/dashboard' : '/register'} className="mt-9 inline-flex h-14 items-center gap-2.5 rounded-full bg-milk px-7 text-[16px] font-semibold text-ink transition-colors hover:bg-white">
            {signedIn ? 'Открыть кабинет' : 'Попробовать бесплатно'}<Icon name="arrow-right" size={18} />
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
    <footer>
      <div className={cx(wrap, 'flex flex-col gap-6 py-10 md:flex-row md:items-center md:justify-between')}>
        <div className="flex flex-col gap-1.5">
          <Link href="/" className="w-fit"><Logo size={26} className="text-[16px]" /></Link>
          <span className="text-[13px] text-muted">© {new Date().getFullYear()} Карьерный навигатор</span>
        </div>
        <nav aria-label="Нижнее меню"><ul className="flex flex-wrap gap-x-6 gap-y-2 text-[14px] text-ink-2">
          {links.map(([t, h]) => <li key={t}><Link href={h} className="transition-colors hover:text-ink">{t}</Link></li>)}
        </ul></nav>
      </div>
    </footer>
  );
}
