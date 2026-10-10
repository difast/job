import { activeConsent } from './outbound';
import { jobtoo } from './config';

/** Показывать ли кнопку «Перейти в JobToo» и есть ли уже согласие. */
export async function jobtooButtonState(userId: string) {
  if (!jobtoo.outboundReady()) return null;
  return { hasConsent: !!(await activeConsent(userId)) };
}
