// Фоновые задачи интеграции с JobToo (только Node.js): отправка очереди событий и очистка устаревших данных.
import { flushOutbox } from './lib/partners/events';
import { cleanupImports } from './lib/partners/imports';

export function startPartnerJobs() {
  if (process.env.JOBTOO_INTEGRATION_ENABLED !== '1') return;
  const g = globalThis as unknown as { __partnerTimer?: NodeJS.Timeout };
  if (g.__partnerTimer) return;
  let n = 0;
  g.__partnerTimer = setInterval(() => {
    void flushOutbox();
    if (n++ % 60 === 0) void cleanupImports().catch((e) => console.warn('[integration] cleanup failed', e));
  }, 60_000);
  g.__partnerTimer.unref?.();
}

/** Служебные письма об окончании Pro: проверка раз в час (MAIL_JOBS_INTERVAL_MS — только для тестов). */
export function startMailJobs() {
  const g = globalThis as unknown as { __mailTimer?: NodeJS.Timeout };
  if (g.__mailTimer) return;
  const every = Math.max(1000, Number(process.env.MAIL_JOBS_INTERVAL_MS) || 60 * 60_000);
  const run = () => void import('./lib/emails').then((m) => m.runProNotices()).catch((e) => console.warn('[mail] pro notices failed', (e as Error).message));
  setTimeout(run, Math.min(every, 60_000)).unref?.();
  g.__mailTimer = setInterval(run, every);
  g.__mailTimer.unref?.();
}
