import { z } from 'zod';
import { db } from '@/lib/db';
import { requireAdminApi } from '@/lib/admin/auth';
import { ApiError, handler, json } from '@/lib/http';
import { allow } from '@/lib/partners/ratelimit';

const utm = z.string().trim().toLowerCase().regex(/^[a-z0-9._-]{1,64}$/, 'Метка: латиница, цифры, «-», «_», «.»').optional().or(z.literal('').transform(() => undefined));
const schema = z.object({
  slug: z.string().trim().toLowerCase().regex(/^[a-z0-9-]{2,40}$/, 'Адрес: латиница, цифры и дефис, 2–40 символов'),
  name: z.string().trim().min(2, 'Название — от 2 символов').max(60),
  utmSource: utm, utmMedium: utm, utmCampaign: utm,
});

// Новая маркетинговая ссылка /go/<slug> (Reels, кампания, блогер…). Только для администратора.
export const POST = handler(async (req: Request) => {
  const admin = await requireAdminApi();
  if (!allow(`admin-links:${admin.id}`, 20)) throw new ApiError(429, 'Слишком много запросов');
  const d = schema.parse(await req.json().catch(() => ({})));
  if (await db.marketingLink.findUnique({ where: { slug: d.slug } })) throw new ApiError(409, 'Ссылка с таким адресом уже есть');
  const link = await db.marketingLink.create({ data: { slug: d.slug, name: d.name, utmSource: d.utmSource ?? null, utmMedium: d.utmMedium ?? null, utmCampaign: d.utmCampaign ?? null } });
  return json({ ok: true, id: link.id, slug: link.slug });
});
