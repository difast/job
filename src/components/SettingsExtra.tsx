'use client';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
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

  // Смена пароля и удаление аккаунта подтверждаются кодом из письма (если почта не настроена — паролем)
  const [step, setStep] = useState<null | 'password' | 'delete'>(null);
  const [code, setCode] = useState('');
  const [resendAt, setResendAt] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [delPass, setDelPass] = useState('');
  const [delError, setDelError] = useState('');
  useEffect(() => {
    if (resendAt <= Date.now()) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [resendAt]);
  const wait = Math.max(0, Math.ceil((resendAt - now) / 1000));

  async function sendCode(purpose: 'password' | 'delete', setErr: (s: string) => void) {
    setBusy(`code-${purpose}`); setErr('');
    const r = await request('/api/profile/code', { method: 'POST', json: { purpose }, timeoutMs: 30_000 });
    setBusy(null);
    if (!r.ok) { setErr(r.error); return false; }
    setStep(purpose); setCode(''); setResendAt(Date.now() + 60_000); setNow(Date.now());
    toast(`Код отправлен на ${email}`);
    return true;
  }
  function cancelCode() { setStep(null); setCode(''); setError(''); setDelError(''); }

  async function savePassword(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (mailOn && step !== 'password') { await sendCode('password', setError); return; }
    setBusy('pass'); setError('');
    const r = await request('/api/profile/password', { method: 'POST', json: mailOn ? { code, password: pass } : { current: hasPassword ? current : undefined, password: pass }, timeoutMs: 20_000 });
    setBusy(null);
    if (!r.ok) { setError(r.error); return; }
    setCurrent(''); setPass(''); setCode(''); setStep(null);
    toast(hasPassword ? 'Пароль изменён. Вход на других устройствах завершён' : 'Пароль задан — теперь можно входить по e-mail и паролю'); router.refresh();
  }

  async function startDelete() {
    if (busy) return;
    const ok = await confirm({ title: 'Удалить аккаунт?', text: `Будут безвозвратно удалены профиль, резюме, вакансии, адаптации, сопроводительные письма и история тренировок. Сохранённые карты отвяжутся, автопродление отключится, доступ к Pro прекратится — за неиспользованные дни можно вернуть деньги по заявлению на support@clymly.ru. Восстановить аккаунт будет нельзя.${mailOn ? ' Для подтверждения пришлём код на почту.' : ''}`, confirm: mailOn ? 'Получить код' : 'Продолжить', danger: true });
    if (!ok) return;
    if (mailOn) await sendCode('delete', setDelError); else setStep('delete');
  }

  async function confirmDelete(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy('delete'); setDelError('');
    const r = await request('/api/profile', { method: 'DELETE', json: mailOn ? { code } : { password: delPass }, timeoutMs: 30_000 });
    setBusy(null);
    if (!r.ok) { setDelError(r.error); return; }
    window.location.href = '/login?deleted=1';
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
      <Row title={hasPassword ? 'Пароль' : 'Задайте пароль'} hint={hasPassword ? `Для входа по e-mail и паролю.${mailOn ? ' Смену подтвердим кодом из письма.' : ''}` : 'Аккаунт создан при переходе из JobToo. Задайте пароль, чтобы входить в Clymly напрямую.'}>
        <form onSubmit={savePassword} className="space-y-2.5" data-testid="password-form">
          {!mailOn && hasPassword && <input type="password" autoComplete="current-password" placeholder="Текущий пароль" value={current} onChange={(e) => setCurrent(e.target.value)} className={input} aria-label="Текущий пароль" />}
          <input type="password" autoComplete="new-password" placeholder="Новый пароль, минимум 8 символов" value={pass} onChange={(e) => setPass(e.target.value)} className={input} aria-label="Новый пароль" minLength={8} required disabled={step === 'password'} />
          {step === 'password' && (
            <div className="space-y-2" data-testid="password-code-step">
              <p className="text-sm text-ink-2">Мы отправили 6-значный код на <span className="font-medium user-text">{email}</span>. Он действует 15 минут.</p>
              <input type="text" inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} placeholder="Код из письма" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} className={`${input} tracking-[0.3em]`} aria-label="Код из письма" data-testid="password-code" />
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <Button type="submit" variant="secondary" disabled={!!busy || pass.length < 8 || (!mailOn && hasPassword && !current) || (step === 'password' && code.length !== 6)} data-testid="password-submit">{(busy === 'pass' || busy === 'code-password') && <Spinner />}{step === 'password' ? 'Подтвердить' : mailOn ? 'Получить код' : hasPassword ? 'Сменить' : 'Задать пароль'}</Button>
            {step === 'password' && <Button type="button" size="sm" variant="ghost" disabled={!!busy || wait > 0} onClick={() => sendCode('password', setError)} data-testid="password-resend">{wait > 0 ? `Отправить ещё раз через ${wait} с` : 'Отправить код ещё раз'}</Button>}
            {step === 'password' && <Button type="button" size="sm" variant="ghost" disabled={!!busy} onClick={cancelCode}>Отмена</Button>}
          </div>
          {error && <Alert>{error}</Alert>}
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
      <Row title="Удаление аккаунта" hint="Профиль и все материалы удаляются безвозвратно. Сведения об оплатах остаются в обезличенном виде, как требует закон.">
        {step === 'delete' ? (
          <form onSubmit={confirmDelete} className="space-y-2.5" data-testid="delete-form">
            {mailOn
              ? <><p className="text-sm text-ink-2">Введите код из письма, отправленного на <span className="font-medium user-text">{email}</span>.</p><input type="text" inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} placeholder="Код из письма" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} className={`${input} tracking-[0.3em]`} aria-label="Код из письма" data-testid="delete-code" /></>
              : <input type="password" autoComplete="current-password" placeholder="Текущий пароль" value={delPass} onChange={(e) => setDelPass(e.target.value)} className={input} aria-label="Текущий пароль" />}
            <div className="flex flex-wrap items-center gap-2">
              <Button type="submit" variant="danger" disabled={!!busy || (mailOn ? code.length !== 6 : !delPass)} data-testid="delete-confirm">{busy === 'delete' && <Spinner />}Удалить навсегда</Button>
              {mailOn && <Button type="button" size="sm" variant="ghost" disabled={!!busy || wait > 0} onClick={() => sendCode('delete', setDelError)}>{wait > 0 ? `Отправить ещё раз через ${wait} с` : 'Отправить код ещё раз'}</Button>}
              <Button type="button" size="sm" variant="ghost" disabled={!!busy} onClick={cancelCode}>Отмена</Button>
            </div>
            {delError && <Alert>{delError}</Alert>}
          </form>
        ) : (
          <div className="space-y-2.5">
            <Button variant="danger" size="sm" disabled={!!busy || step === 'password'} onClick={startDelete} data-testid="delete-account">{busy === 'code-delete' && <Spinner />}Удалить аккаунт</Button>
            {delError && <Alert>{delError}</Alert>}
          </div>
        )}
      </Row>
      <Row title="Поддержка" hint="Вопросы по работе сервиса, оплате и персональным данным.">
        <a href="mailto:support@clymly.ru" className="font-medium text-accent-600 hover:text-accent-700" data-testid="support-email">support@clymly.ru</a>
      </Row>
    </div>
  );
}
