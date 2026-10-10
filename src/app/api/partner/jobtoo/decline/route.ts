import { handler, json } from '@/lib/http';
import { declineInbound } from '@/lib/partners/inbound';
import { clearStart, readStart } from '@/lib/partners/start-cookie';

// Человек отказался от условий Clymly: данные у JobToo не запрашиваем, сообщаем им событием consent_declined
export const POST = handler(async () => {
  const start = await readStart();
  await clearStart();
  if (start) await declineInbound(start.code, { placement: start.placement });
  return json({ ok: true });
});
