import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

// Проверка состояния для хостинга: приложение живо и БД отвечает
export async function GET() {
  try {
    await db.$queryRaw`SELECT 1`;
    return Response.json({ status: 'ok' });
  } catch {
    return Response.json({ status: 'error' }, { status: 503 });
  }
}
