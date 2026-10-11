import { requireAdminApi } from '@/lib/admin/auth';
import { handler, json } from '@/lib/http';
import { verifySmtp } from '@/lib/mail';

export const dynamic = 'force-dynamic';

/** Проверка почты для администратора: подключение и вход на SMTP без отправки письма. Пароли не возвращаются. */
export const GET = handler(async () => {
  await requireAdminApi();
  const env = (k: string) => (process.env[k] ?? '').trim();
  const r = await verifySmtp();
  return json({
    ...r,
    settings: { SMTP_HOST: env('SMTP_HOST') || null, SMTP_PORT: env('SMTP_PORT') || '465', SMTP_USER: env('SMTP_USER') ? 'задан' : 'не задан', SMTP_PASSWORD: env('SMTP_PASSWORD') ? 'задан' : 'не задан', SMTP_FROM: env('SMTP_FROM') || null },
  });
});
