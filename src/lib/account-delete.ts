// Удаление аккаунта по запросу пользователя. Личные данные и содержимое стираются; запись пользователя
// остаётся обезличенной, чтобы платежи (сумма, тариф, даты) сохранились для учёта и выручки в админке.
import { randomBytes } from 'node:crypto';
import { db } from './db';
import { currentTier } from './billing/plans';
import { currentPurchase } from './billing/service';
import { sendAccountDeleted } from './emails';

export async function deleteAccount(userId: string) {
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user || user.deletedAt) return;
  // Для письма: номер заказа активного Pro — по нему можно вернуть деньги за неиспользованные дни
  const tier = currentTier(user);
  const active = tier.tier === 'pro' ? await currentPurchase(userId) : null;
  const pro = tier.tier === 'pro' && tier.until ? { orderId: active?.id ?? '—', until: tier.until } : null;
  const now = new Date();
  await db.$transaction([
    db.session.deleteMany({ where: { userId } }),
    db.emailToken.deleteMany({ where: { userId } }),
    db.practiceAttempt.deleteMany({ where: { userId } }),
    db.vacancy.deleteMany({ where: { userId } }), // адаптации и письма — каскадом
    db.resume.deleteMany({ where: { userId } }),
    db.userCard.deleteMany({ where: { userId } }), // в Clymly только id способа оплаты и «MasterCard •• 4444»
    db.partnerLink.deleteMany({ where: { userId } }),
    db.partnerConsent.deleteMany({ where: { userId } }),
    db.partnerImport.deleteMany({ where: { userId } }),
    db.partnerLoginCode.deleteMany({ where: { userId } }),
    db.partnerHandoff.updateMany({ where: { userId }, data: { userId: null, externalUserId: null } }),
    db.integrationEvent.updateMany({ where: { userId }, data: { userId: null, partnerUserId: null } }),
    db.user.update({
      where: { id: userId },
      data: {
        email: `deleted-${userId}@deleted.invalid`, name: 'Удалённый пользователь', passwordHash: randomBytes(32).toString('hex'), hasPassword: false,
        professionId: null, level: null, plan: 'free', planUntil: null, emailVerifiedAt: null, pdConsentAt: null, pdConsentVer: null,
        autopayPlan: null, autopaySince: null, autopayFails: 0, autopayNotice: null, autopayNoticeAt: null, autopayAmount: null,
        deletedAt: now,
      },
    }),
  ]);
  void sendAccountDeleted(user, pro);
}
