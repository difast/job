// Выбор ИИ-провайдера. AI_PROVIDER: gigachat | anthropic | none. Без AI_PROVIDER — GigaChat, если задан
// GIGACHAT_AUTH_KEY, иначе Anthropic, если задан ANTHROPIC_API_KEY, иначе none.
// none — упрощённый режим без ИИ (правила на сервере, результат помечается «упрощённый анализ»).
// Если провайдер выбран явно, но не настроен, вызов ИИ завершается понятной ошибкой (приложение при этом работает).
import { AiError } from './errors';
import { createAnthropic } from './providers/anthropic';
import { createGigaChat, gigaChatConfig } from './providers/gigachat';
import type { AiProvider } from './providers/types';

export type ProviderName = 'gigachat' | 'anthropic' | 'none';
type Env = Record<string, string | undefined>;

export function selectedProvider(env: Env = process.env): ProviderName {
  const v = (env.AI_PROVIDER ?? '').trim().toLowerCase();
  if (v === 'gigachat' || v === 'anthropic' || v === 'none') return v;
  if ((env.GIGACHAT_AUTH_KEY ?? '').trim()) return 'gigachat';
  if ((env.ANTHROPIC_API_KEY ?? '').trim()) return 'anthropic';
  return 'none';
}

/** true — AI-функции идут через провайдера; false — упрощённый режим без ИИ. */
export const llmEnabled = (env: Env = process.env) => selectedProvider(env) !== 'none';

let memo: { sig: string; provider: AiProvider } | null = null;

/** Провайдер для вызова. Бросает AiError('config') с диагностикой, если провайдер выбран, но не настроен. */
export function getAiProvider(env: Env = process.env): AiProvider {
  const name = selectedProvider(env);
  if (name === 'none') throw new AiError('config', 'ИИ-провайдер не выбран (AI_PROVIDER=none)');
  if (name === 'gigachat') {
    const c = gigaChatConfig(env);
    if (!c.ok) throw new AiError('config', `GigaChat не настроен: ${c.problem}`);
    const sig = `g|${c.config.model}|${c.config.apiUrl}|${c.config.authUrl}|${c.config.scope}|${c.config.authKey.length}|${c.config.timeoutMs}|${c.config.maxRetries}|${c.config.structured}|${!!c.config.ca}`;
    if (memo?.sig !== sig) memo = { sig, provider: createGigaChat(c.config) };
    return memo.provider;
  }
  const key = (env.ANTHROPIC_API_KEY ?? '').trim();
  if (!key) throw new AiError('config', 'Anthropic не настроен: не задан ANTHROPIC_API_KEY');
  const model = (env.ANTHROPIC_MODEL ?? '').trim() || 'claude-sonnet-5-5';
  if (memo?.sig !== `a|${model}`) memo = { sig: `a|${model}`, provider: createAnthropic(key, model) };
  return memo.provider;
}

/** Состояние для диагностики (без секретов): какой провайдер выбран и настроен ли он. */
export function aiStatus(env: Env = process.env): { provider: ProviderName; configured: boolean; model: string | null; problem: string | null } {
  const provider = selectedProvider(env);
  if (provider === 'none') return { provider, configured: false, model: null, problem: null };
  try { const p = getAiProvider(env); return { provider, configured: true, model: p.model, problem: null }; } catch (e) {
    return { provider, configured: false, model: null, problem: e instanceof AiError ? e.diagnostic : 'ошибка конфигурации' };
  }
}
