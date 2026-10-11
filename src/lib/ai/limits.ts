// Ограничение частоты запросов к ИИ: защищает лимит токенов провайдера и от случайных повторов.
import { ApiError } from '../http';
import { allow } from '../partners/ratelimit';
import { llmEnabled } from './provider';

const PER_USER = 30; // запросов за 10 минут на пользователя
const GLOBAL = 120; // запросов в минуту на весь сервис

export function aiRateLimit(userId: string) {
  if (!llmEnabled()) return; // упрощённый режим не обращается к провайдеру
  if (!allow(`ai:${userId}`, PER_USER, 10 * 60_000)) throw new ApiError(429, 'Слишком много запросов к ИИ подряд. Подождите несколько минут и повторите.');
  if (!allow('ai:all', GLOBAL, 60_000)) throw new ApiError(429, 'Сейчас много запросов к ИИ. Подождите минуту и повторите.');
}
