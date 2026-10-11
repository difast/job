import { db } from '@/lib/db';
import { aiStatus } from '@/lib/ai/provider';

export const dynamic = 'force-dynamic';

// Проверка состояния для хостинга: приложение живо и БД отвечает
export async function GET() {
  try {
    await db.$queryRaw`SELECT 1`;
    const ai = aiStatus();
    return Response.json({ status: 'ok', ai: { provider: ai.provider, configured: ai.configured } }); // без секретов и подробностей
  } catch {
    return Response.json({ status: 'error' }, { status: 503 });
  }
}
