'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { request } from '@/lib/client';
import { JOBTOO_CONSENT_TEXT, JOBTOO_FIELDS, type JobTooPlacement } from '@/lib/partners/shared';
import Icon from './Icon';
import Modal from './Modal';
import { ActionError, Button, cx } from './ui';

const track = (event: string, placement: string, requestId?: string) =>
  fetch('/api/integrations/jobtoo/track', { method: 'POST', keepalive: true, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ event, placement, requestId }) }).catch(() => {});

/** Подпись и пояснение зависят от шага пользователя — на экране показывается только одно подходящее действие. */
const CONTEXT: Record<JobTooPlacement, { label: string; title: string; text: string }> = {
  dashboard: { label: 'Перейти к вакансиям в JobToo', title: 'Ищете вакансии?', text: 'Перенесём профиль и резюме в JobToo — сервис поиска работы — и откроем ваш кабинет там. Регистрироваться заново не нужно.' },
  resume: { label: 'Перейти к вакансиям в JobToo', title: 'Ищете вакансии?', text: 'Перенесём профиль и это резюме в JobToo и откроем ваш кабинет там. Регистрироваться заново не нужно.' },
  vacancies: { label: 'Перейти к вакансиям в JobToo', title: 'Нужно больше вакансий?', text: 'В JobToo — подбор вакансий по вашему резюме. Перенесём профиль и резюме, регистрироваться заново не нужно.' },
  adaptation: { label: 'Откликнуться через JobToo', title: 'Резюме готово к отклику', text: 'Передадим профиль и резюме с принятыми правками в JobToo — там можно откликнуться на вакансии.' },
  interview: { label: 'Продолжить поиск работы в JobToo', title: 'Что дальше?', text: 'Перенесём профиль и резюме в JobToo и откроем подбор вакансий — регистрироваться заново не нужно.' },
};

/**
 * Переход в JobToo (внешний сервис-партнёр). При первом переходе — окно согласия, затем сервер передаёт данные
 * и возвращает одноразовую ссылку входа. В URL персональные данные не попадают.
 */
export default function JobTooButton({ placement, vacancyId, hasConsent, origin, className, full, size = 'md' }: {
  placement: JobTooPlacement; vacancyId?: string; hasConsent: boolean; origin: string; className?: string; full?: boolean; size?: 'md' | 'lg';
}) {
  const ctx = CONTEXT[placement];
  const [consent, setConsent] = useState(hasConsent);
  const [open, setOpen] = useState(false);
  const [checked, setChecked] = useState(false);
  const [phase, setPhase] = useState<'idle' | 'sending' | 'redirect'>('idle');
  const [error, setError] = useState('');
  const [wait, setWait] = useState(0); // сколько секунд JobToo просит подождать перед повтором
  const busy = phase !== 'idle';

  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  useEffect(() => {
    // показ кнопки — не чаще раза за сессию на каждое место
    try {
      const k = `jobtoo-shown:${placement}`;
      if (sessionStorage.getItem(k)) return;
      sessionStorage.setItem(k, '1');
    } catch { /* приватный режим — не критично */ }
    void track('button_shown', placement);
  }, [placement]);

  async function go() {
    if (busy || wait > 0) return;
    setPhase('sending'); setError('');
    const r = await request<{ url: string; requestId: string }>('/api/integrations/jobtoo/handoff', { method: 'POST', json: { placement, vacancyId }, timeoutMs: 45_000 });
    if (!r.ok) {
      setPhase('idle'); setError(r.error);
      const ra = Number(r.body?.retryAfter);
      if (Number.isFinite(ra) && ra > 0) setWait(Math.min(Math.ceil(ra), 600));
      return;
    }
    setPhase('redirect');
    await track('redirect_opened', placement, r.data.requestId);
    window.location.assign(r.data.url);
  }

  function click() {
    if (busy) return;
    void track('button_clicked', placement);
    if (consent) return void go();
    setChecked(false); setOpen(true);
    void track('consent_shown', placement);
  }

  async function accept() {
    setPhase('sending'); setError('');
    const r = await request('/api/integrations/jobtoo/consent', { method: 'POST', json: { placement }, timeoutMs: 20_000 });
    if (!r.ok) { setPhase('idle'); setError(r.error); return; }
    setConsent(true); setOpen(false); setPhase('idle');
    await go();
  }

  function decline() {
    if (busy) return;
    setOpen(false);
    void track('consent_declined', placement);
  }

  return (
    <div className={cx(full && 'w-full', className)}>
      <Button variant="partner" size={size} className={full ? 'w-full' : undefined} onClick={click} loading={busy}
        loadingText={phase === 'redirect' ? 'Открываем JobToo…' : 'Передаём профиль и резюме…'}
        aria-label={`${ctx.label} — откроется сайт JobToo`} data-testid={`jobtoo-${placement}`}>
        {ctx.label}<Icon name="external" size={15} />
      </Button>
      {error && !open && (
        <ActionError className="mt-3" message={<>{error} Данные в JobToo не переданы.{wait > 0 && <span data-testid="jobtoo-wait"> Повторить можно через {wait} с.</span>}</>} onRetry={wait > 0 ? undefined : go}>
          {origin && <a href={origin} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium underline underline-offset-2 hover:no-underline">Открыть JobToo без переноса резюме<Icon name="external" size={13} /></a>}
        </ActionError>
      )}

      <Modal open={open} onClose={decline} width="max-w-lg" title="Передать данные в JobToo?"
        description="JobToo создаст или найдёт ваш профиль и загрузит в него резюме — вы сразу окажетесь в своём кабинете JobToo."
        footer={<>
          <Button variant="ghost" onClick={decline} disabled={busy}>Отмена</Button>
          <Button variant="primary" onClick={accept} disabled={!checked} loading={busy} loadingText="Передаём…" data-testid="jobtoo-consent-ok">Передать и перейти в JobToo</Button>
        </>}>
        <div className="space-y-4 text-sm leading-relaxed text-ink-2">
          <div>
            <div className="font-medium text-ink">Что передаём</div>
            <ul className="mt-1.5 space-y-1">{JOBTOO_FIELDS.map((f) => <li key={f} className="flex gap-2"><Icon name="check" size={15} className="mt-0.5 shrink-0 text-accent-600" />{f}</li>)}</ul>
          </div>
          <p><span className="font-medium text-ink">Кому:</span> {JOBTOO_CONSENT_TEXT.recipient}. <span className="font-medium text-ink">Зачем:</span> {JOBTOO_CONSENT_TEXT.purpose}. <span className="font-medium text-ink">Срок:</span> {JOBTOO_CONSENT_TEXT.term}.</p>
          <p className="text-[13px] text-muted">{JOBTOO_CONSENT_TEXT.revoke} Подробнее — в <Link href="/privacy#transfer" target="_blank" className="underline underline-offset-2 hover:text-ink">Политике конфиденциальности</Link>.</p>
          <label className="flex items-start gap-3 rounded-lg border border-line bg-canvas p-3.5 text-[13px] text-ink">
            <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--color-accent-600)]" data-testid="jobtoo-consent" />
            <span>Согласен(на) на передачу перечисленных данных в JobToo</span>
          </label>
          {error && <ActionError message={error} />}
        </div>
      </Modal>
    </div>
  );
}

/** Карточка перехода в JobToo: заголовок шага, что произойдёт, кнопка. Визуально вторична по отношению к действиям Clymly. */
export function JobTooCard({ placement, state, vacancyId, layout = 'stack' }: { placement: JobTooPlacement; state: { hasConsent: boolean; origin: string }; vacancyId?: string; layout?: 'stack' | 'row' }) {
  const ctx = CONTEXT[placement];
  return (
    <section aria-label={`${ctx.title} JobToo`} data-testid="jobtoo-card"
      className={cx('rounded-2xl border border-line bg-white p-5', layout === 'row' && 'flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between')}>
      <div className="min-w-0">
        <div className="flex items-center gap-2 text-[15px] font-medium">{ctx.title}<span className="rounded-full bg-[#f4e8e5] px-2 py-0.5 text-[11px] font-medium text-wine">JobToo</span></div>
        <p className="mt-1 text-sm leading-relaxed text-ink-2">{ctx.text}</p>
      </div>
      <JobTooButton placement={placement} vacancyId={vacancyId} hasConsent={state.hasConsent} origin={state.origin} full={layout === 'stack'} className={layout === 'stack' ? 'mt-4' : 'shrink-0'} />
    </section>
  );
}
