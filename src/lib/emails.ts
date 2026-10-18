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
    intro: `${first(u.name)}, пароль от аккаунта ${u.email} в Clymly ${how === 'reset' ? 'был изменён по ссылке восстановления' : 'был изменён в настройках'} ${date(new Date())}. ${how === 'reset' ? 'Все прежние сеансы входа завершены.' : 'Вход на других устройствах завершён — там понадобится новый пароль.'}\n\nЕсли это были вы — ничего делать не нужно.`,
    button: 'Войти в Clymly', url: `${site()}/login`,
    outro: `Если вы не меняли пароль, сразу восстановите доступ: ${site()}/forgot-password — и напишите нам на ${COMPANY.email}.`,
  });
}

export const sendPasswordChanged = (u: { name: string; email: string }, how: 'reset' | 'settings') =>
  deliver('password-changed', u.email, 'Пароль в Clymly изменён', passwordChangedMail(u, how));

/* ───────── Коды подтверждения (смена пароля, удаление аккаунта) ───────── */
export type CodePurpose = 'password' | 'delete';
export const CODE_TTL_MIN = 15;

export function codeMail(u: { name: string; email: string }, code: string, purpose: CodePurpose) {
  const pw = purpose === 'password';
  return layout({
    title: pw ? 'Код для смены пароля' : 'Код для удаления аккаунта',
    intro: pw
      ? `${first(u.name)}, вы меняете пароль от аккаунта ${u.email} в Clymly. Введите этот код в настройках, чтобы подтвердить, что это вы:`
      : `${first(u.name)}, вы запросили удаление аккаунта ${u.email} в Clymly. Введите этот код в настройках, чтобы подтвердить удаление. Удаление необратимо: резюме, вакансии, письма и история тренировок будут стёрты.`,
    code,
    outro: `Код действует ${CODE_TTL_MIN} минут и срабатывает один раз. Никому его не сообщайте — сотрудники Clymly никогда не спрашивают коды. Если вы ничего не запрашивали, просто проигнорируйте письмо и смените пароль: ${site()}/forgot-password. ${SUPPORT}`,
  });
}

export const sendCode = (u: { name: string; email: string }, code: string, purpose: CodePurpose) =>
  deliver(`code-${purpose}`, u.email, purpose === 'password' ? 'Код для смены пароля в Clymly' : 'Код для удаления аккаунта Clymly', codeMail(u, code, purpose));

/* ───────── Аккаунт удалён ───────── */
export function accountDeletedMail(u: { name: string; email: string }, hadPro: boolean) {
  return layout({
    title: 'Аккаунт удалён',
    intro: `${first(u.name)}, аккаунт ${u.email} в Clymly удалён ${date(new Date())} по вашему запросу. Мы стёрли профиль, резюме, вакансии, адаптации, сопроводительные письма и историю тренировок, отвязали сохранённые карты и завершили все сеансы входа.${hadPro ? '\n\nАвтопродление Pro отключено — списаний больше не будет. Оставшийся оплаченный срок Pro аннулирован вместе с аккаунтом; по вопросам возврата напишите нам.' : ''}\n\nСведения об оплатах хранятся в обезличенном виде столько, сколько требует закон о бухгалтерском учёте. Спасибо, что были с нами — будем рады видеть вас снова.`,
    button: 'Создать новый аккаунт', url: `${site()}/register`,
    outro: `Если вы не удаляли аккаунт, срочно напишите нам на ${COMPANY.email}.`,
  });
}

export const sendAccountDeleted = (u: { name: string; email: string }, hadPro: boolean) =>
  deliver('account-deleted', u.email, 'Аккаунт Clymly удалён', accountDeletedMail(u, hadPro));

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
export function paymentMail(u: { name: string }, p: { id: string; planId: string; planName: string | null; amount: number; provider: string; accessFrom: Date; accessUntil: Date; paidAt: Date }, autopay: { date: Date; amount: number; card: string } | null = null) {
  const name = p.planName ?? getPlan(p.planId)?.name ?? p.planId;
  const test = p.provider === 'stub';
  const later = p.accessFrom.getTime() - p.paidAt.getTime() > 60_000;
  return layout({
    title: test ? 'Тестовая оплата прошла' : 'Pro подключён',
    intro: `${first(u.name)}, спасибо! Оплата тарифа «${name}» подтверждена.${later ? ` Новый период начнётся после окончания текущего — ${date(p.accessFrom)}.` : ''} Pro действует до ${date(p.accessUntil)}.${test ? '\n\nЭто тестовый режим: деньги не списывались.' : ''}`,
    rows: [['Тариф', name], ['Сумма', formatRub(p.amount)], ['Период Pro', `${date(p.accessFrom)} — ${date(p.accessUntil)}`], ['Способ оплаты', PROVIDER_LABEL[p.provider] ?? p.provider], ['Номер заказа', p.id],
      ['Автопродление', autopay ? `включено: около ${date(autopay.date)} спишем ${formatRub(autopay.amount)} с карты ${autopay.card}` : 'не включено']],
    button: 'Тариф и оплата', url: `${site()}/billing`,
    outro: autopay
      ? `Перед каждым списанием пришлём напоминание за 3 дня. Отключить автопродление можно в любой момент: удалите карту в разделе «Тариф и оплата». Кассовый чек присылает платёжный сервис. ${SUPPORT}`
      : `По окончании срока деньги не спишутся автоматически. Кассовый чек присылает платёжный сервис, если он предусмотрен. ${SUPPORT}`,
  });
}

/** Письмо об успешной оплате. Вызывается один раз — после перехода заказа в «оплачен». */
export async function sendPaymentSucceeded(paymentId: string) {
  const p = await db.payment.findUnique({ where: { id: paymentId }, include: { user: { select: { name: true, email: true } } } });
  if (!p || p.status !== 'succeeded' || !p.accessFrom || !p.accessUntil) return false;
  const name = p.planName ?? getPlan(p.planId)?.name ?? 'Pro';
  const ap = await autopayInfo(p.userId);
  return deliver('payment', p.user.email, `Оплата «${name}» прошла — Clymly`, paymentMail(p.user, { ...p, accessFrom: p.accessFrom, accessUntil: p.accessUntil, paidAt: p.paidAt ?? p.updatedAt }, ap));
}

/* ───────── Автопродление и карты ───────── */
const IF_NOT_YOU = 'Если это были не вы — ответьте на это письмо.';

/** Дата и сумма следующего списания и основная карта; null — автопродление выключено. */
async function autopayInfo(userId: string) {
  const u = await db.user.findUnique({ where: { id: userId }, select: { planUntil: true, autopayPlan: true, autopayAmount: true, cards: { where: { isPrimary: true }, select: { title: true } } } });
  if (!u?.autopayPlan || !u.planUntil || !u.cards[0]) return null;
  const plan = getPlan(u.autopayPlan);
  return { date: new Date(u.planUntil.getTime() - 86_400_000), amount: u.autopayAmount ?? plan?.price ?? 0, card: u.cards[0].title, planName: plan?.name ?? 'Pro' };
}

const userOf = (id: string) => db.user.findUnique({ where: { id }, select: { name: true, email: true, planUntil: true } });

export async function sendProRenewed(paymentId: string) {
  const p = await db.payment.findUnique({ where: { id: paymentId }, include: { user: { select: { name: true, email: true } } } });
  if (!p || !p.accessUntil) return false;
  const card = p.cardId ? await db.userCard.findUnique({ where: { id: p.cardId }, select: { title: true } }) : null;
  return deliver('autopay-renewed', p.user.email, 'Pro продлён — Clymly', layout({
    title: 'Pro продлён',
    intro: `${first(p.user.name)}, автопродление сработало: Clymly Pro продлён до ${date(p.accessUntil)}.`,
    rows: [['Тариф', p.planName ?? 'Pro'], ['Списано', formatRub(p.amount)], ...(card ? [['Карта', card.title] as [string, string]] : []), ['Pro действует до', date(p.accessUntil)], ['Номер заказа', p.id]],
    button: 'Тариф и оплата', url: `${site()}/billing`,
    outro: `Кассовый чек присылает платёжный сервис. Отключить автопродление — удалите карту в разделе «Тариф и оплата». ${SUPPORT}`,
  }));
}

/** Напоминание за 3+ дня до списания. false — письмо не ушло (списания без него не будет). */
export async function sendAutopayReminder(userId: string) {
  const u = await db.user.findUnique({ where: { id: userId }, select: { name: true, email: true, planUntil: true, autopayPlan: true, autopayAmount: true, autopayNoticeAt: true, cards: { orderBy: { createdAt: 'asc' } } } });
  if (!u?.planUntil || !u.autopayPlan || !u.autopayAmount || !u.autopayNoticeAt) return false;
  const { chargeDate } = await import('./billing/autopay');
  const when = chargeDate(u.planUntil, u.autopayNoticeAt);
  const primary = u.cards.find((c) => c.isPrimary) ?? u.cards[0];
  const plan = getPlan(u.autopayPlan);
  return deliver('autopay-reminder', u.email, `Скоро продлим Pro: ${date(when)} — Clymly`, layout({
    title: 'Скоро продлим Pro',
    intro: `${first(u.name)}, ${date(when)} мы продлим Clymly Pro и спишем ${formatRub(u.autopayAmount)} с карты ${primary?.title ?? ''}.${u.cards.length > 1 ? ' Если списание не пройдёт, попробуем ещё раз, а затем другие привязанные карты.' : ' Если списание не пройдёт, попробуем ещё раз.'}

Не хотите продлевать — удалите карты в разделе «Тариф и оплата» до этой даты: оплаченный срок до ${date(u.planUntil)} сохранится.`,
    rows: [['Тариф', plan?.name ?? 'Pro'], ['Дата списания', date(when)], ['Сумма', formatRub(u.autopayAmount)], ['Карта', primary?.title ?? '—']],
    button: 'Управлять автопродлением', url: `${site()}/billing#cards`,
    outro: `Это обязательное уведомление об автопродлении. ${SUPPORT}`,
  }));
}

export async function sendAutopayFailed(userId: string, next: 'retry' | 'other') {
  const u = await userOf(userId);
  if (!u) return false;
  return deliver('autopay-failed', u.email, 'Не удалось продлить Pro — Clymly', layout({
    title: 'Не удалось продлить Pro',
    intro: `${first(u.name)}, списание за продление Clymly Pro не прошло. ${next === 'retry' ? 'Попробуем ещё раз примерно через 8 часов.' : 'Попробуем списать с другой привязанной карты.'}${u.planUntil ? ` Pro действует до ${date(u.planUntil)}.` : ''}`,
    button: 'Проверить карты', url: `${site()}/billing#cards`,
    outro: `Проверьте баланс и ограничения карты или привяжите другую. ${IF_NOT_YOU} ${SUPPORT}`,
  }));
}

export async function sendAutopayDisabled(userId: string) {
  const u = await userOf(userId);
  if (!u) return false;
  return deliver('autopay-disabled', u.email, 'Автопродление Pro отключено — Clymly', layout({
    title: 'Автопродление Pro отключено',
    intro: `${first(u.name)}, продлить Clymly Pro не удалось ни с одной привязанной карты, поэтому автопродление отключено, а данные карт удалены.${u.planUntil && u.planUntil > new Date() ? ` Pro действует до ${date(u.planUntil)}.` : ''}

Продлить Pro можно вручную в разделе «Тариф и оплата».`,
    button: 'Продлить Pro', url: `${site()}/billing`,
    outro: `${IF_NOT_YOU} ${SUPPORT}`,
  }));
}

export async function sendCardBound(userId: string, title: string) {
  const u = await userOf(userId);
  if (!u) return false;
  return deliver('card-bound', u.email, 'Карта привязана — Clymly', layout({
    title: 'Карта привязана',
    intro: `${first(u.name)}, карта ${title} привязана и стала основной для автопродления Clymly Pro; остальные карты остались запасными. Проверочный платёж 1 ₽ отменён — деньги вернутся на карту, срок зависит от банка.`,
    button: 'Тариф и оплата', url: `${site()}/billing#cards`,
    outro: `Удалить карту можно в любой момент в разделе «Тариф и оплата». ${IF_NOT_YOU} ${SUPPORT}`,
  }));
}

export async function sendCardRemoved(userId: string, title: string) {
  const u = await userOf(userId);
  if (!u) return false;
  return deliver('card-removed', u.email, 'Карта удалена — Clymly', layout({
    title: 'Карта удалена',
    intro: `${first(u.name)}, карта ${title} удалена. Автопродление продолжит работать с остальными привязанными картами.`,
    button: 'Тариф и оплата', url: `${site()}/billing#cards`,
    outro: `${IF_NOT_YOU} ${SUPPORT}`,
  }));
}

export async function sendCardUnlinked(userId: string, title: string) {
  const u = await userOf(userId);
  if (!u) return false;
  return deliver('card-unlinked', u.email, 'Карта отвязана, автопродление отключено — Clymly', layout({
    title: 'Карта отвязана',
    intro: `${first(u.name)}, карта ${title} удалена, других карт нет — автопродление Clymly Pro отключено.${u.planUntil && u.planUntil > new Date() ? ` Pro действует до ${date(u.planUntil)}.` : ''}

Включить автопродление снова: оплатите Pro с отметкой «Запомнить данные карты» или привяжите карту в разделе «Тариф и оплата».`,
    button: 'Тариф и оплата', url: `${site()}/billing#cards`,
    outro: `${IF_NOT_YOU} ${SUPPORT}`,
  }));
}

/* ───────── Окончание Pro ───────── */
export const REMIND_DAYS = 3;

export function proEndingMail(u: { name: string }, until: Date) {
  return layout({
    title: 'Pro скоро закончится',
    intro: `${first(u.name)}, оплаченный период Clymly Pro закончится ${date(until)}. Автопродление не включено — деньги не спишутся без вашего действия.\n\nЧтобы продолжить без перерыва, продлите Pro: ${offers()}. Новый срок добавится к текущему.`,
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
  const { isDaytime } = await import('./billing/autopay');
  if (!isDaytime(now)) return { ending: 0, ended: 0 }; // напоминания — только днём по Москве
  let ending = 0, ended = 0;
  const soon = new Date(now.getTime() + REMIND_DAYS * 86_400_000);
  // «Pro скоро закончится» — только без автопродления (с ним приходит напоминание о списании)
  const endingUsers = await db.user.findMany({ where: { plan: 'pro', autopayPlan: null, planUntil: { gt: now, lte: soon } }, select: { id: true, name: true, email: true, planUntil: true, proReminderFor: true }, take: 200 });
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
