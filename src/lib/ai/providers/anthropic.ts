// Anthropic (Claude) — прежний провайдер Clymly, оставлен как альтернатива. Включается ANTHROPIC_API_KEY.
import Anthropic from '@anthropic-ai/sdk';
import { AiError } from '../errors';
import type { AiProvider, ChatRequest, ChatResult } from './types';

let client: Anthropic | null = null;

export function createAnthropic(apiKey: string, model: string): AiProvider {
  client ??= new Anthropic({ apiKey, maxRetries: 2, timeout: 50_000 });
  return {
    name: 'anthropic',
    model,
    async chat(req: ChatRequest): Promise<ChatResult> {
      try {
        const res = await client!.messages.create({
          model, max_tokens: req.maxTokens ?? 2048, temperature: req.temperature ?? 0.3, system: req.system,
          messages: [...(req.history ?? []), { role: 'user', content: req.user }],
        });
        const text = res.content.map((b) => (b.type === 'text' ? b.text : '')).join('').trim();
        if (res.stop_reason === 'max_tokens' && req.json) throw new AiError('bad_response', 'Anthropic: ответ обрезан по max_tokens');
        if (!text) throw new AiError('bad_response', 'Anthropic: пустой ответ');
        return { text, finishReason: res.stop_reason ?? null, model: res.model };
      } catch (e) {
        if (e instanceof AiError) throw e;
        const status = (e as { status?: number }).status;
        if (status === 401) throw new AiError('auth', 'Anthropic 401: ключ отклонён');
        if (status === 403) throw new AiError('forbidden', 'Anthropic 403');
        if (status === 404) throw new AiError('config', `Anthropic 404: модель ${model} не найдена`);
        if (status === 429) throw new AiError('rate_limit', 'Anthropic 429');
        throw new AiError('unavailable', `Anthropic: ${status ? `HTTP ${status}` : 'сеть/таймаут'}`);
      }
    },
  };
}
