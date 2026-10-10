import Link from 'next/link';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import Icon, { type IconName } from './Icon';
import { BRAND, BRAND_COLORS, MARK } from '@/lib/brand';

export const cx = (...a: (string | false | null | undefined)[]) => a.filter(Boolean).join(' ');

/* ───────── Кнопки ─────────
   Единая иерархия:
   primary   — одно главное действие на экране (терракотовая заливка);
   secondary — альтернативные действия (белая кнопка с контуром);
   ghost     — вспомогательные действия и навигационные ссылки (без фона);
   danger    — удаление и другие опасные операции (красный текст и контур);
   partner   — переход во внешний сервис JobToo (винный акцент + значок внешней ссылки).
   Размеры: sm 36px, md 40px, lg 44px — одинаковые отступы, радиус и шрифт для всех вариантов.
   Состояния: hover, active (нажатие), focus-visible (общий контур из globals.css), disabled, loading (спиннер + aria-busy). */
export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'partner';
export type ButtonSize = 'sm' | 'md' | 'lg';

export function buttonClass({ variant = 'primary', size = 'md', className }: { variant?: ButtonVariant; size?: ButtonSize; className?: string } = {}) {
  return cx(
    'inline-flex shrink-0 select-none items-center justify-center gap-2 whitespace-nowrap rounded-lg font-medium transition-[background-color,border-color,color] duration-150',
    'disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 aria-busy:cursor-progress',
    size === 'sm' && 'h-9 px-3.5 text-[13px]', size === 'md' && 'h-10 px-4 text-sm', size === 'lg' && 'h-11 px-5 text-[15px]',
    variant === 'primary' && 'bg-accent-600 text-white hover:bg-accent-700 active:bg-[#7d2e1b]',
    variant === 'secondary' && 'border border-line-strong bg-white text-ink hover:border-[#c2b8aa] hover:bg-subtle active:bg-stone',
    variant === 'ghost' && 'text-ink-2 hover:bg-subtle hover:text-ink active:bg-stone',
    variant === 'danger' && 'border border-[#ecccc7] bg-white text-bad hover:border-[#dfaaa3] hover:bg-bad-soft active:bg-[#f5dcd8]',
    variant === 'partner' && 'border border-[#dcc6c2] bg-[#faf4f2] text-wine hover:border-[#caa8a2] hover:bg-[#f4e8e5] active:bg-[#eddad6]',
    className,
  );
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: ButtonSize; loading?: boolean; loadingText?: ReactNode };

/** Кнопка. loading — блокирует повторное нажатие и показывает спиннер (с текстом loadingText, если он задан). */
export function Button({ variant, size, className, loading, loadingText, children, disabled, type = 'button', ...p }: ButtonProps) {
  return (
    <button {...p} type={type} disabled={disabled || loading} aria-busy={loading || undefined} className={buttonClass({ variant, size, className })}>
      {loading ? <><Spinner />{loadingText ?? children}</> : children}
    </button>
  );
}

export function LinkButton({ href, variant, size, className, children, ...p }: { href: string; variant?: ButtonVariant; size?: ButtonSize; className?: string; children: ReactNode } & Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, 'href' | 'className'>) {
  return <Link href={href} className={buttonClass({ variant, size, className })} {...p}>{children}</Link>;
}

/** Текстовая ссылка-переход (tertiary): «Открыть полный анализ →». */
export function TextLink({ href, children, className, arrow = true }: { href: string; children: ReactNode; className?: string; arrow?: boolean }) {
  return <Link href={href} className={cx('inline-flex items-center gap-1 text-sm font-medium text-accent-600 transition-colors hover:text-accent-700', className)}>{children}{arrow && <Icon name="arrow-right" size={14} />}</Link>;
}

/** Ошибка действия с безопасным повтором — единый вид для всех кнопок. */
export function ActionError({ message, onRetry, retryLabel = 'Повторить', children, className }: { message: ReactNode; onRetry?: () => void; retryLabel?: string; children?: ReactNode; className?: string }) {
  return (
    <div role="alert" className={cx('rounded-lg border border-[#f1cfcb] bg-bad-soft px-3.5 py-3 text-sm leading-relaxed text-bad', className)}>
      <div>{message}</div>
      {(onRetry || children) && (
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
          {onRetry && <button type="button" onClick={onRetry} className="font-medium underline underline-offset-2 hover:no-underline">{retryLabel}</button>}
          {children}
        </div>
      )}
    </div>
  );
}

/* ───────── Поверхности ───────── */
export function Card({ children, className, as: T = 'div' }: { children: ReactNode; className?: string; as?: 'div' | 'section' | 'li' }) {
  return <T className={cx('rounded-2xl border border-line bg-white p-5 sm:p-6', className)}>{children}</T>;
}

export function CardTitle({ children, icon, action }: { children: ReactNode; icon?: IconName; action?: ReactNode }) {
  return (
    <div className="mb-4 flex items-center justify-between gap-3">
      <h2 className="flex items-center gap-2 font-sans text-[13px] font-medium text-muted" style={{ letterSpacing: 0 }}>{icon && <Icon name={icon} size={15} />}{children}</h2>
      {action}
    </div>
  );
}

export function PageHeader({ title, subtitle, action, back }: { title: ReactNode; subtitle?: ReactNode; action?: ReactNode; back?: { href: string; label: string } }) {
  return (
    <header className="mb-8">
      {back && <Link href={back.href} className="mb-4 inline-flex items-center gap-1.5 text-[13px] text-muted transition-colors hover:text-ink"><Icon name="arrow-left" size={14} />{back.label}</Link>}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-[28px] font-semibold leading-[1.15] tracking-[-0.025em] sm:text-[32px]">{title}</h1>
          {subtitle && <div className="mt-2 max-w-2xl text-[15px] text-ink-2">{subtitle}</div>}
        </div>
        {action}
      </div>
    </header>
  );
}

export function EmptyState({ icon = 'file', title, text, action }: { icon?: IconName; title: string; text: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-dashed border-line-strong bg-white px-6 py-14 text-center">
      <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-accent-50 text-accent-600"><Icon name={icon} size={20} /></div>
      <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      <p className="mt-1.5 max-w-md text-sm text-ink-2">{text}</p>
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

export function Alert({ children, tone = 'bad', className }: { children: ReactNode; tone?: 'bad' | 'warn' | 'ok' | 'info'; className?: string }) {
  const t = { bad: 'bg-bad-soft text-bad border-[#f1cfcb]', warn: 'bg-warn-soft text-warn border-[#f3dfb8]', ok: 'bg-ok-soft text-ok border-[#c8e8da]', info: 'bg-accent-50 text-accent-700 border-accent-100' }[tone];
  return (
    <div role={tone === 'bad' ? 'alert' : 'status'} className={cx('flex items-start gap-2.5 rounded-lg border px-3.5 py-3 text-sm', t, className)}>
      <Icon name={tone === 'ok' ? 'check-circle' : tone === 'info' ? 'target' : 'alert'} size={16} className="mt-0.5 shrink-0" />
      <div className="min-w-0">{children}</div>
    </div>
  );
}

export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'accent' | 'ok' | 'warn' | 'bad' }) {
  const t = { neutral: 'bg-subtle text-ink-2', accent: 'bg-accent-50 text-accent-700', ok: 'bg-ok-soft text-ok', warn: 'bg-warn-soft text-warn', bad: 'bg-bad-soft text-bad' }[tone];
  return <span className={cx('inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium', t)}>{children}</span>;
}

export function Chip({ children }: { children: ReactNode }) {
  return <span className="inline-flex items-center rounded-md border border-line bg-white px-2.5 py-1 text-[13px] text-ink-2">{children}</span>;
}

/* ───────── Оценки ───────── */
export const scoreColor = (n: number) => (n >= 75 ? '#2f2b27' : n >= 50 ? '#c95a37' : '#8f2f26');
export const scoreTone = (n: number) => (n >= 75 ? 'text-ink' : n >= 50 ? 'text-accent-600' : 'text-bad');
export const scoreVerdict = (n: number) => (n >= 80 ? 'Сильный результат' : n >= 65 ? 'Хорошая основа' : n >= 45 ? 'Есть над чем поработать' : 'Требует доработки');

export function ScoreRing({ value, size = 132, stroke = 8, suffix = '/ 100', label, color, track = '#eee8df' }: { value: number; size?: number; stroke?: number; suffix?: string; label?: string; color?: string; track?: string }) {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r, o = c * (1 - value / 100);
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} role="img" aria-label={label ?? `Оценка ${value}`}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track} strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color ?? scoreColor(value)} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={o} className="ring-anim" style={{ ['--ring-c' as string]: c, ['--ring-o' as string]: o }} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center leading-none">
        <span className="tabular font-semibold tracking-tight" style={{ fontSize: size * 0.3 }}>{value}</span>
        {suffix && <span className="mt-1 text-xs text-muted" style={{ fontSize: Math.max(11, size * 0.1) }}>{suffix}</span>}
      </div>
    </div>
  );
}

export function Meter({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between text-sm"><span className="text-ink-2">{label}</span><span className="tabular font-medium">{value}</span></div>
      <div className="h-1.5 overflow-hidden rounded-full bg-[#eee8df]" role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
        <div className="bar-anim h-full rounded-full" style={{ width: `${value}%`, background: color ?? scoreColor(value) }} />
      </div>
    </div>
  );
}

/* ───────── Состояния ───────── */
export function Spinner({ className }: { className?: string }) {
  return <svg className={cx('h-4 w-4 animate-spin', className)} viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" opacity="0.25" /><path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" /></svg>;
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx('skeleton', className)} aria-hidden="true" />;
}

export function EngineNote({ engine }: { engine: 'llm' | 'heuristic' }) {
  return (
    <p className="mt-6 flex items-center gap-1.5 text-xs text-muted">
      <Icon name="shield" size={13} />
      {engine === 'llm' ? 'Анализ выполнен с помощью AI на основе только ваших данных.' : 'Анализ выполнен встроенным движком правил. Он не придумывает факты — работает только с текстом вашего резюме.'}
    </p>
  );
}

/* ───────── Переключатель-«таблетки» ───────── */
export function Segmented<T extends string>({ value, onChange, options, label, size = 'md' }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; label: string; size?: 'sm' | 'md' }) {
  return (
    <div role="radiogroup" aria-label={label} className="no-scrollbar flex gap-2 overflow-x-auto">
      {options.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={value === o.value} onClick={() => onChange(o.value)}
          className={cx('shrink-0 whitespace-nowrap rounded-full font-medium transition-colors duration-150', size === 'sm' ? 'h-8 px-3.5 text-[13px]' : 'h-10 px-4 text-sm',
            value === o.value ? 'bg-ink text-milk' : 'bg-stone text-ink-2 hover:bg-[#e2d9cc] hover:text-ink')}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* ───────── Логотип Clymly ─────────
   Текстовый логотип: «Cl» «y» «ml» «y». Первая «y» — терракота, вторая — винный; остальные буквы — цвет текста.
   inverted — для тёмного фона (светлые варианты фирменных цветов). Знак — та же «y», что в favicon. */
export function LogoMark({ size = 28 }: { size?: number; inverted?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" className="shrink-0">
      <rect width="64" height="64" rx="15" fill={BRAND_COLORS.wine} />
      <path d={MARK.arm} stroke={BRAND_COLORS.terracottaLight} strokeWidth={MARK.stroke} strokeLinecap="round" fill="none" />
      <path d={MARK.stem} stroke={BRAND_COLORS.milk} strokeWidth={MARK.stroke} strokeLinecap="round" fill="none" />
    </svg>
  );
}

export function Logo({ size = 22, className, inverted }: { size?: number; className?: string; inverted?: boolean }) {
  return (
    <span role="img" aria-label={BRAND.name} data-testid="logo"
      className={cx('font-display inline-flex select-none items-baseline font-semibold leading-none tracking-[-0.035em]', inverted ? 'logo-inverted text-milk' : 'text-ink', className)}
      style={{ fontSize: size }}>
      <span aria-hidden="true">Cl<span className="brand-y1">y</span>ml<span className="brand-y2">y</span></span>
    </span>
  );
}

export const initials = (name: string) => name.trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '').join('') || '·';
