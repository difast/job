// Общие для сервера и браузера константы интеграции с JobToo (без секретов и серверного кода).

/** Версия текста согласия на передачу данных в JobToo. Меняется при каждом изменении текста ниже. */
export const JOBTOO_CONSENT_VERSION = '2026-10-10';

/** Что передаём в JobToo — показывается в окне согласия. */
export const JOBTOO_FIELDS = [
  'Имя и e-mail',
  'Профессия и уровень, выбранные в Clymly',
  'Текст резюме и навыки, найденные в нём',
  'Адаптированная версия резюме — если переходите со страницы адаптации',
] as const;

export const JOBTOO_CONSENT_TEXT = {
  recipient: 'JobToo — сервис поиска работы',
  purpose: 'создать или найти ваш профиль в JobToo, загрузить в него резюме и подобрать вакансии',
  term: 'до отзыва согласия',
  revoke: 'Отозвать согласие и отвязать аккаунт можно в разделе «Настройки → Интеграции». Данные, уже переданные в JobToo, обрабатываются по правилам JobToo.',
};

export const JOBTOO_PLACEMENTS = ['dashboard', 'resume', 'adaptation', 'settings'] as const;
export type JobTooPlacement = (typeof JOBTOO_PLACEMENTS)[number];
