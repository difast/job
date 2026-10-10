// Доступ к админке: только вошедший пользователь, чей e-mail (из сессии в БД, не из запроса) есть в ADMIN_EMAILS.
import { notFound } from 'next/navigation';
import { getUser } from '../auth';
import { ApiError } from '../http';
import { isAdmin } from '../partners/analytics';

/** Для страниц админки: чужим — «Страница не найдена» (существование раздела не раскрывается). */
export async function requireAdminPage() {
  const user = await getUser();
  if (!user || !user.pdConsentAt || !isAdmin(user.email)) notFound();
  return user;
}

/** Для API админки: 404 без подробностей. */
export async function requireAdminApi() {
  const user = await getUser();
  if (!user || !user.pdConsentAt || !isAdmin(user.email)) throw new ApiError(404, 'Не найдено');
  return user;
}
