'use client';
import { LEVELS, type LevelKey } from '@/lib/types';
import Icon from './Icon';
import { cx } from './ui';

const META: Record<LevelKey, { title: string; hint: string }> = {
  junior: { title: 'Junior', hint: 'До 2 лет опыта, работаю под руководством' },
  middle: { title: 'Middle', hint: '2–5 лет, веду задачи самостоятельно' },
  senior: { title: 'Senior', hint: '5+ лет, принимаю решения и наставляю' },
  lead: { title: 'Lead / Руководитель', hint: 'Управляю командой или направлением' },
};

export default function LevelPicker({ value, onChange }: { value: LevelKey | null; onChange: (l: LevelKey) => void }) {
  return (
    <div className="grid gap-2.5 sm:grid-cols-2" role="radiogroup" aria-label="Уровень">
      {LEVELS.map((l) => {
        const on = value === l;
        return (
          <button key={l} type="button" role="radio" aria-checked={on} onClick={() => onChange(l)}
            className={cx('relative rounded-xl border p-4 text-left transition-colors', on ? 'border-accent-600 bg-accent-50 shadow-[0_0_0_1px_var(--color-accent-600)]' : 'border-line-strong bg-white hover:border-[#bfc3d1] hover:bg-subtle')}>
            <div className="flex items-center justify-between"><span className="font-medium">{META[l].title}</span>
              {on && <span className="flex h-5 w-5 items-center justify-center rounded-full bg-accent-600 text-white"><Icon name="check" size={12} strokeWidth={2.6} /></span>}</div>
            <div className="mt-1 text-[13px] text-ink-2">{META[l].hint}</div>
          </button>
        );
      })}
    </div>
  );
}
