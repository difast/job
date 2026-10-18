// ВРЕМЕННО: демо-режим привязки/отвязки карт для скриншотов в заявку ЮKassa.
// Работает только для e-mail из CARD_DEMO_EMAILS. Ничего не пишет в базу, не обращается к ЮKassa, не шлёт письма:
// состояние хранится в памяти сервера (сбрасывается при перезапуске или кнопкой «Сбросить демо»). Удалить после скриншотов.
import { randomUUID } from 'node:crypto';

export interface DemoCard { id: string; title: string; isPrimary: boolean; createdAt: number }
interface DemoState { cards: DemoCard[]; until: Date }

export const DEMO_TEST_CARDS = ['MasterCard •• 4444', 'Мир •• 2222', 'Visa •• 1111'];

export function isCardDemo(email: string | null | undefined): boolean {
  const list = (process.env.CARD_DEMO_EMAILS ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  return !!email && list.includes(email.toLowerCase());
}

const g = globalThis as unknown as { __cardDemo?: Map<string, DemoState> };
const store = (g.__cardDemo ??= new Map());

const initial = (): DemoState => ({ cards: [{ id: randomUUID(), title: DEMO_TEST_CARDS[0], isPrimary: true, createdAt: Date.now() }], until: new Date(Date.now() + 24 * 86_400_000) });

export function demoState(userId: string): DemoState {
  let s = store.get(userId);
  if (!s) { s = initial(); store.set(userId, s); }
  return s;
}

export function demoReset(userId: string) { store.set(userId, initial()); }

/** Новая карта сразу становится основной (как в настоящем потоке). */
export function demoBind(userId: string, title: string) {
  const s = demoState(userId);
  if (s.cards.length >= 5) return false;
  s.cards.forEach((c) => { c.isPrimary = false; });
  s.cards.push({ id: randomUUID(), title: DEMO_TEST_CARDS.includes(title) ? title : DEMO_TEST_CARDS[1], isPrimary: true, createdAt: Date.now() });
  return true;
}

export function demoPrimary(userId: string, id: string) {
  const s = demoState(userId);
  if (!s.cards.some((c) => c.id === id)) return false;
  s.cards.forEach((c) => { c.isPrimary = c.id === id; });
  return true;
}

/** Удаление по одной: удалили основную — основной становится самая ранняя. */
export function demoDelete(userId: string, id: string) {
  const s = demoState(userId);
  const card = s.cards.find((c) => c.id === id);
  if (!card) return null;
  s.cards = s.cards.filter((c) => c.id !== id);
  if (card.isPrimary && s.cards.length) s.cards.sort((a, b) => a.createdAt - b.createdAt)[0].isPrimary = true;
  return { autopay: s.cards.length > 0 };
}
