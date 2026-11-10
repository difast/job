'use client';
// Поле пароля с кнопкой «показать / скрыть» (глазик). Остальные свойства передаются в input как есть.
import { useState, type InputHTMLAttributes } from 'react';
import Icon from './Icon';
import { cx } from './ui';

export default function PasswordInput({ className, wrapClassName, ...p }: Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & { wrapClassName?: string }) {
  const [shown, setShown] = useState(false);
  return (
    <span className={cx('relative block w-full', wrapClassName)}>
      <input {...p} type={shown ? 'text' : 'password'} className={cx(className, 'pr-11')} />
      <button type="button" onClick={() => setShown((v) => !v)} aria-label={shown ? 'Скрыть пароль' : 'Показать пароль'} aria-pressed={shown} title={shown ? 'Скрыть пароль' : 'Показать пароль'}
        className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-lg text-muted transition-colors hover:text-ink focus-visible:text-ink focus-visible:outline-none" data-testid="password-toggle">
        <Icon name={shown ? 'eye-off' : 'eye'} size={18} />
      </button>
    </span>
  );
}
