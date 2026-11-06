// Учёт расхода ИИ: кто (пользователь) и сколько токенов потратил каждый запрос к провайдеру.
// Пользователь передаётся через контекст асинхронного вызова: его задаёт aiRateLimit (или импорт JobToo)
// в начале обработки запроса, а записи делает llm.ts — без протаскивания userId через все AI-функции.
import { AsyncLocalStorage } from 'node:async_hooks';
import { db } from '../db';
import type { Usage } from './providers/types';

const ctx = new AsyncLocalStorage<{ userId: string | null }>();

/** Привязывает последующие запросы к ИИ в текущей цепочке вызовов к пользователю. */
export function setAiUser(userId: string | null) { ctx.enterWith({ userId }); }

export function recordAiCall(c: { feature: string; provider: string; model: string | null; usage?: Usage; ok: boolean; errorKind?: string; durationMs: number }) {
  const u = c.usage;
  // Запись не должна влиять на ответ пользователю: ошибки БД только в лог
  void db.aiCall.create({
    data: {
      userId: ctx.getStore()?.userId ?? null, feature: c.feature, provider: c.provider, model: c.model,
      promptTokens: u?.prompt ?? 0, completionTokens: u?.completion ?? 0, totalTokens: u?.total ?? 0,
      ok: c.ok, errorKind: c.errorKind ?? null, durationMs: Math.round(c.durationMs),
    },
  }).catch((e) => console.warn('[ai] учёт токенов не записан:', (e as Error).message));
}
