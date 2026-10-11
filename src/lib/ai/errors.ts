// Ошибки ИИ-провайдера. Пользователь видит только userMessage (без технических подробностей),
// в лог пишется kind и краткая диагностика — без текстов резюме, токенов и ключей.
import { ApiError } from '../http';

export type AiErrorKind =
  | 'config' // провайдер выбран, но не настроен (нет ключа и т. п.)
  | 'auth' // ключ отклонён провайдером
  | 'forbidden' // нет доступа к модели / области
  | 'rate_limit' // превышен лимит запросов
  | 'quota' // закончились оплаченные/бесплатные токены
  | 'unavailable' // сеть, таймаут, 5xx
  | 'bad_response' // ответ не в ожидаемом формате
  | 'refused'; // модель отказалась отвечать (фильтр провайдера)

const USER_MESSAGE: Record<AiErrorKind, string> = {
  config: 'ИИ-анализ временно недоступен: сервис настраивается. Попробуйте позже.',
  auth: 'ИИ-анализ временно недоступен. Мы уже разбираемся — попробуйте позже.',
  forbidden: 'ИИ-анализ временно недоступен. Мы уже разбираемся — попробуйте позже.',
  rate_limit: 'Сейчас много запросов к ИИ. Подождите минуту и повторите.',
  quota: 'ИИ-анализ временно недоступен: исчерпан лимит запросов сервиса. Попробуйте позже.',
  unavailable: 'ИИ-сервис не ответил. Попробуйте ещё раз через минуту — введённые данные сохранены.',
  bad_response: 'ИИ вернул некорректный ответ. Попробуйте ещё раз.',
  refused: 'ИИ не смог обработать этот текст. Проверьте содержимое и попробуйте ещё раз.',
};

const STATUS: Record<AiErrorKind, number> = { config: 503, auth: 503, forbidden: 503, rate_limit: 429, quota: 503, unavailable: 503, bad_response: 502, refused: 422 };

export class AiError extends ApiError {
  constructor(public kind: AiErrorKind, public diagnostic: string) {
    super(STATUS[kind], USER_MESSAGE[kind]);
    this.name = 'AiError';
  }
}

export const isAiError = (e: unknown): e is AiError => e instanceof AiError;
