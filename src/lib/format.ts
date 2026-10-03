const MSK = 'Europe/Moscow';

export function greeting(now = new Date()): string {
  const h = Number(new Intl.DateTimeFormat('ru-RU', { hour: 'numeric', hour12: false, timeZone: MSK }).format(now)) % 24;
  if (h >= 5 && h < 12) return 'Доброе утро';
  if (h >= 12 && h < 18) return 'Добрый день';
  if (h >= 18 && h < 23) return 'Добрый вечер';
  return 'Доброй ночи';
}

export function relativeDay(date: Date, now = new Date()): string {
  const day = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: MSK }).format(d);
  const diff = Math.round((Date.parse(day(now)) - Date.parse(day(date))) / 86400000);
  if (diff <= 0) return 'сегодня';
  if (diff === 1) return 'вчера';
  if (diff < 7) return `${diff} ${diff < 5 ? 'дня' : 'дней'} назад`;
  return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', timeZone: MSK });
}
