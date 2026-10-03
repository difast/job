import type { ButtonHTMLAttributes, ReactNode } from 'react';

export const cx = (...a: (string | false | null | undefined)[]) => a.filter(Boolean).join(' ');

export function Button({ variant = 'primary', size = 'md', className, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' | 'danger'; size?: 'sm' | 'md' }) {
  return (
    <button
      {...p}
      className={cx(
        'inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors disabled:opacity-50',
        size === 'sm' ? 'h-8 px-3 text-sm' : 'h-10 px-4 text-sm',
        variant === 'primary' && 'bg-accent-600 text-white hover:bg-accent-700',
        variant === 'secondary' && 'border border-line bg-white text-ink hover:bg-slate-50',
        variant === 'ghost' && 'text-muted hover:bg-slate-100 hover:text-ink',
        variant === 'danger' && 'border border-red-200 bg-white text-red-600 hover:bg-red-50',
        className,
      )}
    />
  );
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx('rounded-xl border border-line bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]', className)}>{children}</div>;
}

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 max-w-2xl text-sm text-muted">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function EmptyState({ icon, title, text, action }: { icon?: ReactNode; title: string; text: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-accent-50 text-accent-600">{icon ?? <DocIcon />}</div>
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="mt-1 max-w-md text-sm text-muted">{text}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Badge({ children, tone = 'slate' }: { children: ReactNode; tone?: 'slate' | 'green' | 'amber' | 'red' | 'accent' }) {
  const tones = { slate: 'bg-slate-100 text-slate-700', green: 'bg-emerald-50 text-emerald-700', amber: 'bg-amber-50 text-amber-700', red: 'bg-red-50 text-red-700', accent: 'bg-accent-50 text-accent-700' };
  return <span className={cx('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium', tones[tone])}>{children}</span>;
}

export const scoreTone = (n: number) => (n >= 75 ? 'text-emerald-600' : n >= 50 ? 'text-amber-600' : 'text-red-600');
const barTone = (n: number) => (n >= 75 ? 'bg-emerald-500' : n >= 50 ? 'bg-amber-500' : 'bg-red-500');

export function Bar({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="mb-1 flex justify-between text-sm"><span>{label}</span><span className="font-medium tabular-nums">{value}</span></div>
      <div className="h-1.5 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
        <div className={cx('h-full rounded-full', barTone(value))} style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

export function ScoreRing({ value, size = 120, suffix = '/ 100' }: { value: number; size?: number; suffix?: string }) {
  const r = size / 2 - 8, c = 2 * Math.PI * r;
  const color = value >= 75 ? '#10b981' : value >= 50 ? '#f59e0b' : '#ef4444';
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#f1f5f9" strokeWidth="8" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth="8" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - value / 100)} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-semibold tabular-nums">{value}</span>
        {suffix && <span className="text-xs text-muted">{suffix}</span>}
      </div>
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <svg className={cx('h-4 w-4 animate-spin', className)} viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.25" /><path d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" /></svg>;
}

export const DocIcon = () => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5M9 13h6M9 17h6" /></svg>;

export function EngineNote({ engine }: { engine: 'llm' | 'heuristic' }) {
  return <p className="mt-6 text-xs text-muted">{engine === 'llm' ? 'Анализ выполнен с помощью AI.' : 'Анализ выполнен встроенным движком правил (AI-ключ не подключён). Подключите ANTHROPIC_API_KEY для более глубокого анализа.'}</p>;
}
