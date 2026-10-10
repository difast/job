import { requireApiUser } from '@/lib/auth';
import { ApiError, handler, json } from '@/lib/http';
import { mailEnabled, sendVerification } from '@/lib/email-verify';
import { allow } from '@/lib/partners/ratelimit';

// Повторная отправка письма с подтверждением e-mail
export const POST = handler(async () => {
  const user = await requireApiUser();
  if (user.emailVerifiedAt) return json({ ok: true, already: true });
  if (!mailEnabled()) throw new ApiError(503, 'Отправка писем временно недоступна');
  if (!allow(`verify:${user.id}`, 3, 10 * 60_000)) throw new ApiError(429, 'Письмо уже отправлено. Повторить можно через несколько минут — проверьте папку «Спам».');
  const r = await sendVerification(user);
  if (!r.sent) throw new ApiError(502, r.error ?? 'Не удалось отправить письмо');
  return json({ ok: true });
});
