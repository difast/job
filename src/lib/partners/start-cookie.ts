import { cookies } from 'next/headers';
import { START_COOKIE } from './config';

/** Код перехода из JobToo, сохранённый страницей /partner/jobtoo/start. */
export async function readStart(): Promise<{ code: string; placement: string | null } | null> {
  try {
    const v = JSON.parse((await cookies()).get(START_COOKIE)?.value ?? '');
    return typeof v?.code === 'string' && /^[\w-]{8,200}$/.test(v.code) ? { code: v.code, placement: typeof v.placement === 'string' ? v.placement : null } : null;
  } catch { return null; }
}

export async function clearStart() { (await cookies()).delete(START_COOKIE); }
