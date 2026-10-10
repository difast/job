import { db } from '@/lib/db';
import { requireApiUser } from '@/lib/auth';
import { ApiError, handler } from '@/lib/http';
import { isAdmin, parseFilters, where } from '@/lib/partners/analytics';

// Выгрузка событий интеграции в CSV (без персональных данных)
export const GET = handler(async (req: Request) => {
  const user = await requireApiUser();
  if (!isAdmin(user.email)) throw new ApiError(404, 'Не найдено');
  const f = parseFilters(Object.fromEntries(new URL(req.url).searchParams));
  const rows = await db.integrationEvent.findMany({ where: where(f), orderBy: { createdAt: 'asc' }, take: 100_000 });
  const cols = ['createdAt', 'direction', 'event', 'requestId', 'userId', 'partnerUserId', 'placement', 'platform', 'account', 'errorCode', 'durationMs'] as const;
  const esc = (v: unknown) => { const s = v instanceof Date ? v.toISOString() : v == null ? '' : String(v); return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const csv = '﻿' + [cols.join(';'), ...rows.map((r) => cols.map((c) => esc(r[c])).join(';'))].join('\n');
  return new Response(csv, { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="clymly-jobtoo-${f.days}d.csv"`, 'Cache-Control': 'no-store' } });
});
