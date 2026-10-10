'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { request } from '@/lib/client';
import { useConfirm } from './Confirm';
import { useToast } from './Toast';
import { Alert, Button, Spinner } from './ui';
import Icon from './Icon';
import { ResendVerification } from './VerifyEmail';

function Row({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-3 border-b border-line px-6 py-6 last:border-b-0 sm:grid-cols-[220px_minmax(0,1fr)] sm:gap-8">
      <div><h2 className="font-sans text-[15px] font-semibold" style={{ letterSpacing: 0 }}>{title}</h2>{hint && <p className="mt-1 text-[13px] leading-relaxed text-muted">{hint}</p>}</div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

const input = 'h-10 w-full max-w-sm rounded-lg border border-line-strong px-3.5 text-[15px] outline-none focus:border-accent-500 focus:shadow-[0_0_0_3px_var(--color-accent-100)]';

export interface HistoryItem { id: string; date: string; direction: 'out' | 'in'; status: string; fields: string[] }

export default function SettingsExtra({ hasPassword, integration, email, emailVerified, mailOn }: {
  hasPassword: boolean; email: string; emailVerified: boolean; mailOn: boolean;
  integration: null | { linkedAt: string | null; consentAt: string | null; history: HistoryItem[] };
}) {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const [current, setCurrent] = useState('');
  const [pass, setPass] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [intError, setIntError] = useState('');

  async function savePassword(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy('pass'); setError('');
    const r = await request('/api/profile/password', { method: 'POST', json: { current: hasPassword ? current : undefined, password: pass }, timeoutMs: 20_000 });
    setBusy(null);
    if (!r.ok) { setError(r.error); return; }
    setCurrent(''); setPass(''); toast(hasPassword ? 'Пароль изменён' : 'Пароль задан — теперь можно входить по e-mail и паролю'); router.refresh();
  }

  async function act(kind: 'revoke' | 'unlink') {
    const ok = await confirm(kind === 'revoke'
      ? { title: 'Отозвать согласие?', text: 'Переход в JobToo станет недоступен, пока вы снова не дадите согласие. Данные, уже переданные в JobToo, обрабатываются по правилам JobToo.', confirm: 'Отозвать согласие', danger: true }
      : { title: 'Отвязать аккаунт JobToo?', text: 'Следующий переход из JobToo потребует снова войти в Clymly с паролем. Ваши резюме и вакансии в Clymly сохранятся.', confirm: 'Отвязать', danger: true });
    if (!ok) return;
    setBusy(kind); setIntError('');
    const r = await request(kind === 'revoke' ? '/api/integrations/jobtoo/consent' : '/api/integrations/jobtoo/link', { method: 'DELETE' });
    setBusy(null);
    if (!r.ok) { setIntError(r.error); return; }
    toast(kind === 'revoke' ? 'Согласие отозвано' : 'Аккаунт JobToo отвязан'); router.refresh();
  }

  const fmt = (d: string) => new Date(d).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow' });

  return (
    <div className="mt-6 max-w-[860px] rounded-2xl border border-line bg-white">
      <Row title="E-mail" hint="Подтверждённый адрес защищает аккаунт и позволяет связывать его с JobToo без пароля.">
        <div className="flex flex-wrap items-center justify-between gap-3" data-testid="email-status">
          <div className="min-w-0">
            <div className="truncate font-medium user-text">{email}</div>
            <div className={emailVerified ? 'mt-0.5 inline-flex items-center gap-1 text-sm text-ok' : 'mt-0.5 text-sm text-ink-2'}>{emailVerified ? <><Icon name="check-circle" size={14} />Подтверждён</> : 'Не подтверждён'}</div>
          </div>
          {!emailVerified && mailOn && <ResendVerification />}
        </div>
      </Row>
      <Row title={hasPassword ? 'Пароль' : 'Задайте пароль'} hint={hasPassword ? 'Для входа по e-mail и паролю.' : 'Аккаунт создан при переходе из JobToo. Задайте пароль, чтобы входить в Clymly напрямую.'}>
        <form onSubmit={savePassword} className="space-y-2.5" data-testid="password-form">
          {hasPassword && <input type="password" autoComplete="current-password" placeholder="Текущий пароль" value={current} onChange={(e) => setCurrent(e.target.value)} className={input} aria-label="Текущий пароль" />}
          <div className="flex flex-col gap-2 sm:flex-row">
            <input type="password" autoComplete="new-password" placeholder="Новый пароль, минимум 8 символов" value={pass} onChange={(e) => setPass(e.target.value)} className={input} aria-label="Новый пароль" minLength={8} required />
            <Button type="submit" variant="secondary" disabled={!!busy || pass.length < 8 || (hasPassword && !current)}>{busy === 'pass' && <Spinner />}{hasPassword ? 'Сменить' : 'Задать пароль'}</Button>
          </div>
          {error && <Alert>{error} Введённые данные сохранены в полях.</Alert>}
        </form>
      </Row>
      {integration && (
        <Row title="Интеграции" hint="JobToo — сервис поиска работы. Переход переносит профиль и резюме без повторной регистрации.">
          <div className="space-y-4" data-testid="integration-jobtoo">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="font-medium">JobToo</div>
                <div className="text-sm text-ink-2">{integration.linkedAt ? `Аккаунт связан · ${fmt(integration.linkedAt)}` : 'Аккаунт не связан'}{integration.consentAt ? ` · согласие на передачу дано ${fmt(integration.consentAt)}` : ' · согласия на передачу нет'}</div>
              </div>
              <div className="flex flex-wrap gap-2">
                {integration.consentAt && <Button size="sm" variant="secondary" disabled={!!busy} onClick={() => act('revoke')}>{busy === 'revoke' && <Spinner />}Отозвать согласие</Button>}
                {integration.linkedAt && <Button size="sm" variant="danger" disabled={!!busy} onClick={() => act('unlink')}>{busy === 'unlink' && <Spinner />}Отвязать</Button>}
              </div>
            </div>
            {intError && <Alert>{intError}</Alert>}
            {integration.history.length > 0 && (
              <div>
                <div className="mb-1.5 text-[13px] font-medium text-muted">История передач</div>
                <ul className="divide-y divide-line rounded-lg border border-line text-sm">
                  {integration.history.map((h) => (
                    <li key={h.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3.5 py-2.5">
                      <span className="w-28 shrink-0 text-muted">{fmt(h.date)}</span>
                      <span className="shrink-0">{h.direction === 'out' ? 'Clymly → JobToo' : 'JobToo → Clymly'}</span>
                      <span className="min-w-0 flex-1 truncate text-xs text-muted" title={h.fields.join(', ')}>{h.fields.join(', ')}</span>
                      <span className={h.status === 'ok' ? 'text-ok' : h.status === 'error' ? 'text-bad' : 'text-muted'}>{h.status === 'ok' ? 'Успешно' : h.status === 'error' ? 'Ошибка' : 'В процессе'}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </Row>
      )}
      <Row title="Поддержка" hint="Вопросы по работе сервиса, оплате и персональным данным.">
        <a href="mailto:support@clymly.ru" className="font-medium text-accent-600 hover:text-accent-700" data-testid="support-email">support@clymly.ru</a>
      </Row>
    </div>
  );
}
