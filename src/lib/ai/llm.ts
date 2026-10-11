// Вызов ИИ-провайдера с проверкой формата. Неудачный ответ никогда не подменяется «успешным»:
// после одной попытки исправить формат вызывающий код получает AiError('bad_response').
import { z, type ZodType } from 'zod';
import { AiError } from './errors';
import { getAiProvider } from './provider';
import { JSON_ONLY } from './prompts';

export { llmEnabled } from './provider';

/** Достаёт JSON-объект из ответа модели: снимает ```-обёртку, берёт внешние фигурные скобки. */
export function extractJson(s: string): unknown {
  const t = s.replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '');
  const start = t.indexOf('{');
  const end = t.lastIndexOf('}');
  if (start < 0 || end < start) throw new SyntaxError('в ответе нет JSON-объекта');
  return JSON.parse(t.slice(start, end + 1));
}

const issues = (e: unknown) => e instanceof z.ZodError
  ? e.issues.slice(0, 6).map((i) => `${i.path.join('.') || 'корень'}: ${i.message}`).join('; ')
  : (e as Error).message;

function log(task: string, e: AiError) {
  // Только тип ошибки и диагностика: без текстов пользователя и ответов модели
  console.warn(`[ai] ${task}: ${e.kind} — ${e.diagnostic}`);
}

export interface CallOptions { maxTokens?: number; temperature?: number }

/** JSON-ответ по схеме. Одна повторная попытка с описанием ошибки формата. */
export async function callJson<T>(task: string, prompt: { system: string; user: string }, schema: ZodType<T>, opts: CallOptions = {}): Promise<T> {
  try {
    const provider = getAiProvider();
    let jsonSchema: Record<string, unknown> | undefined;
    try { jsonSchema = z.toJSONSchema(schema, { unrepresentable: 'any' }) as Record<string, unknown>; } catch { jsonSchema = undefined; }
    const system = `${prompt.system}\n\n${JSON_ONLY}`;
    const first = await provider.chat({ system, user: prompt.user, json: true, jsonSchema, maxTokens: opts.maxTokens ?? 3000, temperature: opts.temperature });
    try { return schema.parse(extractJson(first.text)); } catch (e) {
      const second = await provider.chat({
        system, json: true, jsonSchema, maxTokens: opts.maxTokens ?? 3000, temperature: 0.1,
        history: [{ role: 'user', content: prompt.user }, { role: 'assistant', content: first.text.slice(0, 12_000) }],
        user: `Ответ не прошёл проверку формата: ${issues(e)}. Верни исправленный ответ — один JSON-объект строго по заданному формату, без пояснений. Содержание не меняй, если оно не нарушает правила.`,
      });
      try { return schema.parse(extractJson(second.text)); } catch (e2) {
        throw new AiError('bad_response', `${provider.name}: формат ответа не прошёл проверку после повтора (${issues(e2).slice(0, 200)})`);
      }
    }
  } catch (e) {
    if (e instanceof AiError) log(task, e);
    throw e;
  }
}

/** Текстовый ответ. check — серверная проверка результата; при нарушении одна повторная генерация с замечанием. */
export async function callText(task: string, prompt: { system: string; user: string }, check: (t: string) => string | null, opts: CallOptions = {}): Promise<string> {
  try {
    const provider = getAiProvider();
    const first = (await provider.chat({ system: prompt.system, user: prompt.user, maxTokens: opts.maxTokens ?? 1500, temperature: opts.temperature ?? 0.6 })).text;
    const problem = check(first);
    if (!problem) return first;
    const second = (await provider.chat({
      system: prompt.system, maxTokens: opts.maxTokens ?? 1500, temperature: 0.4,
      history: [{ role: 'user', content: prompt.user }, { role: 'assistant', content: first.slice(0, 8_000) }],
      user: `Текст нарушает правила: ${problem}. Перепиши его, исправив это. Используй только сведения из резюме и вакансии.`,
    })).text;
    const problem2 = check(second);
    if (problem2) throw new AiError('bad_response', `${provider.name}: текст не прошёл проверку после повтора (${problem2.slice(0, 120)})`);
    return second;
  } catch (e) {
    if (e instanceof AiError) log(task, e);
    throw e;
  }
}
