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
  revoke: 'Отозвать согласие и отвязать аккаунт можно в разделе «Настройки → Интеграции» или написав на support@clymly.ru. Данные, уже переданные в JobToo, обрабатываются по правилам JobToo.',
};

/** Версия текста согласия на странице приёма перехода из JobToo (получение данных от JobToo). */
export const CLYMLY_INBOUND_CONSENT_VERSION = '2026-10-10';

/** Что Clymly получит от JobToo — показывается на странице приёма. */
export const JOBTOO_INBOUND_FIELDS = [
  'Имя и e-mail (и признак, подтверждена ли почта в JobToo)',
  'Желаемая должность и навыки',
  'Резюме — файл или текст',
  'Вакансия, если вы переходите с карточки отклика',
] as const;

export const JOBTOO_PLACEMENTS = ['dashboard', 'resume', 'adaptation', 'settings'] as const;
export type JobTooPlacement = (typeof JOBTOO_PLACEMENTS)[number];
