import { z } from 'zod';
import { requireApiUser } from '@/lib/auth';
import { ApiError, handler, json } from '@/lib/http';
import { demoBind, demoDelete, demoPrimary, demoReset, demoState, isCardDemo } from '@/lib/billing/card-demo';

// ВРЕМЕННО: демо привязки карт для скриншотов ЮKassa. Для всех, кроме CARD_DEMO_EMAILS, — 404.
const schema = z.object({ action: z.enum(['bind', 'primary', 'delete', 'reset']), id: z.string().max(60).optional(), card: z.string().max(40).optional() });

export const POST = handler(async (req: Request) => {
  const user = await requireApiUser();
  if (!isCardDemo(user.email)) throw new ApiError(404, 'Не найдено');
  const { action, id, card } = schema.parse(await req.json().catch(() => ({})));
  if (action === 'reset') { demoReset(user.id); return json({ ok: true, cards: demoState(user.id).cards.map(({ id, title, isPrimary }) => ({ id, title, isPrimary })) }); }
  if (action === 'bind') {
    if (!card) return json({ ok: true, confirmationUrl: '/pay/card-demo' }); // переход на демо-форму
    if (!demoBind(user.id, card)) throw new ApiError(409, 'Можно привязать не больше 5 карт. Удалите одну, чтобы добавить новую.');
    return json({ ok: true, redirect: '/billing/result?demo=card' });
  }
  if (!id) throw new ApiError(400, 'Не указана карта');
  if (action === 'primary') { if (!demoPrimary(user.id, id)) throw new ApiError(404, 'Карта не найдена'); return json({ ok: true }); }
  const r = demoDelete(user.id, id);
  if (!r) throw new ApiError(404, 'Карта не найдена');
  return json({ ok: true, ...r });
});
