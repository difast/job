import { db } from '@/lib/db';
import { requireApiUser } from '@/lib/auth';
import { ApiError, handler } from '@/lib/http';
import { applyChanges } from '@/lib/changes';
import { resumeToPdf } from '@/lib/pdf';
import { parseJson, type Change } from '@/lib/types';

export const runtime = 'nodejs';

export const GET = handler(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requireApiUser();
  const { id } = await params;
  const a = await db.adaptation.findFirst({ where: { id, vacancy: { userId: user.id } }, include: { resume: true, vacancy: true } });
  if (!a) throw new ApiError(404, 'Адаптация не найдена');
  const text = applyChanges(a.resume.text, parseJson<Change[]>(a.changes, []));
  const pdf = await resumeToPdf(text, `${user.name} — резюме`);
  const slug = a.vacancy.title.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
  const fileName = `resume-${slug || 'adapted'}.pdf`;
  return new Response(new Uint8Array(pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${fileName}"`,
    },
  });
});
