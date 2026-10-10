'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { request } from '@/lib/client';
import { JOBTOO_CONSENT_TEXT, JOBTOO_FIELDS, type JobTooPlacement } from '@/lib/partners/shared';
import Icon from './Icon';
import Modal from './Modal';
import { Alert, Button, Spinner, cx } from './ui';

const track = (event: string, placement: string, requestId?: string) =>
  fetch('/api/integrations/jobtoo/track', { method: 'POST', keepalive: true, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ event, placement, requestId }) }).catch(() => {});

/**
 * «Перейти в JobToo»: при первом переходе — окно согласия, затем сервер передаёт данные в JobToo
 * и возвращает одноразовую ссылку входа. Браузер просто переходит по ней.
 */
export default function JobTooButton({ placement, vacancyId, hasConsent, variant = 'secondary', className, full }: {
  placement: JobTooPlacement; vacancyId?: string; hasConsent: boolean; variant?: 'primary' | 'secondary'; className?: string; full?: boolean;
}) {
  const [consent, setConsent] = useState(hasConsent);
  const [open, setOpen] = useState(false);
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

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
    if (busy) return;
    setBusy(true); setError('');
    const r = await request<{ url: string; requestId: string }>('/api/integrations/jobtoo/handoff', { method: 'POST', json: { placement, vacancyId }, timeoutMs: 20_000 });
    if (!r.ok) { setBusy(false); setError(r.error); return; }
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
    setBusy(true); setError('');
    const r = await request('/api/integrations/jobtoo/consent', { method: 'POST', json: { placement }, timeoutMs: 20_000 });
    if (!r.ok) { setBusy(false); setError(r.error); return; }
    setConsent(true); setOpen(false); setBusy(false);
    await go();
  }

  function decline() {
    setOpen(false);
    void track('consent_declined', placement);
  }

  return (
    <div className={cx(full && 'w-full', className)}>
      <Button variant={variant} className={full ? 'w-full' : undefined} onClick={click} disabled={busy} data-testid={`jobtoo-${placement}`}>
        {busy ? <><Spinner />Передаём данные…</> : <><Icon name="external" size={16} />Перейти в JobToo</>}
      </Button>
      {error && !open && <Alert className="mt-3">{error} <button type="button" onClick={go} className="font-medium underline underline-offset-2">Повторить</button></Alert>}

      <Modal open={open} onClose={decline} width="max-w-lg" title="Передать данные в JobToo?"
        description="JobToo создаст или найдёт ваш профиль и загрузит в него резюме — вы сразу окажетесь в своём кабинете JobToo."
        footer={<>
          <Button variant="ghost" onClick={decline} disabled={busy}>Отмена</Button>
          <Button onClick={accept} disabled={!checked || busy} data-testid="jobtoo-consent-ok">{busy ? <><Spinner />Передаём данные…</> : 'Продолжить'}</Button>
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
          {error && <Alert>{error}</Alert>}
        </div>
      </Modal>
    </div>
  );
}
