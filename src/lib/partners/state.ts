import { activeConsent } from './outbound';
import { jobtoo } from './config';

export interface JobTooState { hasConsent: boolean; origin: string }

/** Показывать ли переход в JobToo, есть ли уже согласие и реальный адрес JobToo (для перехода без передачи данных при сбое). */
export async function jobtooButtonState(userId: string): Promise<JobTooState | null> {
  if (!jobtoo.outboundReady()) return null;
  return { hasConsent: !!(await activeConsent(userId)), origin: jobtoo.loginOrigin() };
}
