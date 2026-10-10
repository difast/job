import { handleInboundHandoff } from '@/lib/partners/inbound';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

// Приём профиля и резюме от JobToo. Формат — docs/partner-api-v1.md
export const POST = (req: Request) => handleInboundHandoff(req);
