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
