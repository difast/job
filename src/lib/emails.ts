// Служебные письма пользователю (кроме подтверждения e-mail — см. email-verify.ts).
// Все письма транзакционные: отправляются по действию пользователя или о его оплаченном тарифе. Рассылок нет.
// Ошибка отправки не ломает основное действие — она только пишется в лог (без содержимого письма).
import { db } from './db';
import { SITE_URL } from './brand';
import { COMPANY } from './legal';
import { describeMailError, layout, mailEnabled, sendMail } from './mail';
import { PLANS, formatRub, getPlan } from './billing/plans';
import { PROVIDER_LABEL } from './billing/provider';

const site = () => SITE_URL.replace(/\/$/, '');
const first = (name: string) => name.trim().split(/\s+/)[0] || 'Здравствуйте';
// «11 января 2027» — без «г.», чтобы дата не давала двойную точку в конце предложения
const date = (d: Date) => d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Moscow' }).replace(/\s*г\.$/, '');
const SUPPORT = `Вопросы — ${COMPANY.email}.`;
/** «Pro — 1 месяц» за 499 ₽ или «Pro — 3 месяца» за 1 190 ₽ — из единого списка тарифов. */
const offers = () => PLANS.filter((p) => p.price > 0).map((p) => `«${p.name}» за ${formatRub(p.price)}`).join(' или ');

async function deliver(kind: string, to: string, subject: string, mail: { html: string; text: string }) {
  if (!mailEnabled()) return false;
  try {
    return (await sendMail({ to, subject, kind, ...mail })).sent;
  } catch (e) {
    const d = describeMailError(e);
    console.error(`[mail] ${kind}: отправка не удалась (${d.kind}) — ${d.hint}`);
    return false;
  }
}

/* ───────── Восстановление пароля ───────── */
export const RESET_TTL_MIN = 60;

export function passwordResetMail(u: { name: string; email: string }, url: string) {
  return layout({
    title: 'Восстановление пароля',
    intro: `${first(u.name)}, мы получили запрос на восстановление пароля для аккаунта ${u.email} в Clymly. Чтобы задать новый пароль, нажмите кнопку ниже.`,
    button: 'Задать новый пароль', url,
    outro: `Ссылка действует ${RESET_TTL_MIN} минут и срабатывает один раз. После смены пароля мы завершим все активные сеансы входа. Если вы не запрашивали восстановление, просто проигнорируйте письмо — пароль останется прежним. ${SUPPORT}`,
  });
}

export const sendPasswordReset = (u: { name: string; email: string }, url: string) =>
  deliver('password-reset', u.email, 'Восстановление пароля в Clymly', passwordResetMail(u, url));

export function passwordChangedMail(u: { name: string; email: string }, how: 'reset' | 'settings') {
  return layout({
    title: 'Пароль изменён',
    intro: `${first(u.name)}, пароль от аккаунта ${u.email} в Clymly ${how === 'reset' ? 'был изменён по ссылке восстановления' : 'был изменён в настройках'} ${date(new Date())}.${how === 'reset' ? ' Все прежние сеансы входа завершены.' : ''}\n\nЕсли это были вы — ничего делать не нужно.`,
    button: 'Войти в Clymly', url: `${site()}/login`,
    outro: `Если вы не меняли пароль, сразу восстановите доступ: ${site()}/forgot-password — и напишите нам на ${COMPANY.email}.`,
  });
}

export const sendPasswordChanged = (u: { name: string; email: string }, how: 'reset' | 'settings') =>
  deliver('password-changed', u.email, 'Пароль в Clymly изменён', passwordChangedMail(u, how));

/* ───────── Приветствие (после подтверждения e-mail) ───────── */
export function welcomeMail(u: { name: string }) {
  return layout({
    title: 'Добро пожаловать в Clymly',
    intro: `${first(u.name)}, адрес подтверждён — спасибо! Clymly помогает подготовиться к поиску работы под вашу профессию и уровень.\n\nС чего начать: загрузите резюме и получите оценку с рекомендациями, добавьте вакансию — покажем совпадение и адаптируем резюме под неё без выдуманных фактов, подготовьте сопроводительное письмо и потренируйтесь отвечать на вопросы собеседования.`,
    button: 'Перейти в кабинет', url: `${site()}/dashboard`,
    outro: `Вы получили это письмо, потому что зарегистрировались в Clymly. Рекламных рассылок мы не отправляем. ${SUPPORT}`,
  });
}

export const sendWelcome = (u: { name: string; email: string }) => deliver('welcome', u.email, 'Добро пожаловать в Clymly', welcomeMail(u));

/* ───────── Оплата Pro ───────── */
export function paymentMail(u: { name: string }, p: { id: string; planId: string; planName: string | null; amount: number; provider: string; accessFrom: Date; accessUntil: Date; paidAt: Date }) {
  const name = p.planName ?? getPlan(p.planId)?.name ?? p.planId;
  const test = p.provider === 'stub';
  const later = p.accessFrom.getTime() - p.paidAt.getTime() > 60_000;
  return layout({
    title: test ? 'Тестовая оплата прошла' : 'Оплата прошла',
    intro: `${first(u.name)}, спасибо! Оплата тарифа «${name}» подтверждена.${later ? ` Новый период начнётся после окончания текущего — ${date(p.accessFrom)}.` : ''} Pro действует до ${date(p.accessUntil)}.${test ? '\n\nЭто тестовый режим: деньги не списывались.' : ''}`,
    rows: [['Тариф', name], ['Сумма', formatRub(p.amount)], ['Период Pro', `${date(p.accessFrom)} — ${date(p.accessUntil)}`], ['Способ оплаты', PROVIDER_LABEL[p.provider] ?? p.provider], ['Номер заказа', p.id]],
    button: 'Тариф и оплата', url: `${site()}/billing`,
    outro: `Это разовый платёж, без автопродления: по окончании срока деньги не спишутся автоматически. Кассовый чек присылает платёжный сервис, если он предусмотрен. ${SUPPORT}`,
  });
}

/** Письмо об успешной оплате. Вызывается один раз — после перехода заказа в «оплачен». */
export async function sendPaymentSucceeded(paymentId: string) {
  const p = await db.payment.findUnique({ where: { id: paymentId }, include: { user: { select: { name: true, email: true } } } });
  if (!p || p.status !== 'succeeded' || !p.accessFrom || !p.accessUntil) return false;
  const name = p.planName ?? getPlan(p.planId)?.name ?? 'Pro';
  return deliver('payment', p.user.email, `Оплата «${name}» прошла — Clymly`, paymentMail(p.user, { ...p, accessFrom: p.accessFrom, accessUntil: p.accessUntil, paidAt: p.paidAt ?? p.updatedAt }));
}

/* ───────── Окончание Pro ───────── */
export const REMIND_DAYS = 3;

export function proEndingMail(u: { name: string }, until: Date) {
  return layout({
    title: 'Pro скоро закончится',
    intro: `${first(u.name)}, оплаченный период Clymly Pro закончится ${date(until)}. Автопродления нет — деньги не спишутся без вашего действия.\n\nЧтобы продолжить без перерыва, продлите Pro: ${offers()}. Новый срок добавится к текущему.`,
    button: 'Продлить Pro', url: `${site()}/billing`,
    outro: `Это служебное письмо о вашем тарифе. ${SUPPORT}`,
  });
}

export function proEndedMail(u: { name: string }, until: Date) {
  return layout({
    title: 'Период Pro закончился',
    intro: `${first(u.name)}, оплаченный период Clymly Pro закончился ${date(until)}. Аккаунт и все ваши данные сохранены — резюме, вакансии, письма и история тренировок на месте.\n\nВернуть Pro можно в любой момент: ${offers()}.`,
    button: 'Подключить Pro', url: `${site()}/billing`,
    outro: `Это служебное письмо о вашем тарифе. ${SUPPORT}`,
  });
}

/**
 * Напоминания об окончании Pro. Каждое письмо — один раз на конкретную дату окончания: если Pro продлили,
 * дата меняется и для нового срока письма придут заново. Запись «отправлено» делается до отправки (атомарно),
 * поэтому параллельный запуск не пришлёт письмо дважды.
 */
export async function runProNotices(now = new Date()) {
  if (!mailEnabled()) return { ending: 0, ended: 0 };
  let ending = 0, ended = 0;
  const soon = new Date(now.getTime() + REMIND_DAYS * 86_400_000);
  const endingUsers = await db.user.findMany({ where: { plan: 'pro', planUntil: { gt: now, lte: soon } }, select: { id: true, name: true, email: true, planUntil: true, proReminderFor: true }, take: 200 });
  for (const u of endingUsers) {
    if (!u.planUntil || +(u.proReminderFor ?? 0) === +u.planUntil) continue;
    const claim = await db.user.updateMany({ where: { id: u.id, planUntil: u.planUntil, OR: [{ proReminderFor: null }, { proReminderFor: { not: u.planUntil } }] }, data: { proReminderFor: u.planUntil } });
    if (claim.count && (await deliver('pro-ending', u.email, `Clymly Pro закончится ${date(u.planUntil)}`, proEndingMail(u, u.planUntil)))) ending++;
  }
  // Окончание — только за последние 7 дней, чтобы не писать о давно истёкших периодах
  const week = new Date(now.getTime() - 7 * 86_400_000);
  const endedUsers = await db.user.findMany({ where: { plan: 'pro', planUntil: { lte: now, gt: week } }, select: { id: true, name: true, email: true, planUntil: true, proEndedFor: true }, take: 200 });
  for (const u of endedUsers) {
    if (!u.planUntil || +(u.proEndedFor ?? 0) === +u.planUntil) continue;
    const claim = await db.user.updateMany({ where: { id: u.id, planUntil: u.planUntil, OR: [{ proEndedFor: null }, { proEndedFor: { not: u.planUntil } }] }, data: { proEndedFor: u.planUntil } });
    if (claim.count && (await deliver('pro-ended', u.email, 'Период Clymly Pro закончился', proEndedMail(u, u.planUntil)))) ended++;
  }
  return { ending, ended };
}
