'use client';
import { LEVELS, LEVEL_LABELS, type LevelKey } from '@/lib/types';
import { cx } from './ui';

const HINT: Record<LevelKey, string> = {
  junior: 'До 2 лет опыта, работаю под руководством',
  middle: '2–5 лет, веду задачи самостоятельно',
  senior: '5+ лет, принимаю решения и наставляю',
  lead: 'Управляю командой или направлением',
};

export default function LevelPicker({ value, onChange }: { value: LevelKey | null; onChange: (l: LevelKey) => void }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Уровень">
      {LEVELS.map((l) => (
        <button key={l} type="button" role="radio" aria-checked={value === l} onClick={() => onChange(l)}
          className={cx('rounded-xl border p-4 text-left transition', value === l ? 'border-accent-600 bg-accent-50 ring-1 ring-accent-600' : 'border-line bg-white hover:border-slate-300')}>
          <div className="font-medium">{LEVEL_LABELS[l]}</div>
          <div className="mt-0.5 text-sm text-muted">{HINT[l]}</div>
        </button>
      ))}
    </div>
  );
}
