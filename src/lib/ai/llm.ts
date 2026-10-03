import Anthropic from '@anthropic-ai/sdk';
import type { ZodType } from 'zod';

export const llmEnabled = () => !!process.env.ANTHROPIC_API_KEY;
const MODEL = () => process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5';

let client: Anthropic | null = null;
const getClient = () => (client ??= new Anthropic());

export const NO_FABRICATION_RULES = `ГЛАВНОЕ ПРАВИЛО: никогда не выдумывай факты о пользователе. Нельзя придумывать опыт, компании, должности, образование, достижения, цифры и навыки, которых нет в резюме. Можно: улучшать формулировки, структурировать, выделять существующие достижения, адаптировать формулировки под вакансию и рекомендовать, что добавить (только как рекомендацию, не как факт). Отвечай по-русски.`;

function extractJson(s: string): unknown {
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start < 0 || end < start) throw new Error('No JSON in model output');
  return JSON.parse(s.slice(start, end + 1));
}

/** Запрос к модели с валидацией JSON по схеме. Бросает исключение при любой ошибке — вызывающий код делает fallback. */
export async function callJson<T>(system: string, user: string, schema: ZodType<T>): Promise<T> {
  const res = await getClient().messages.create({
    model: MODEL(),
    max_tokens: 4096,
    system: `${system}\n\n${NO_FABRICATION_RULES}\nОтвечай ТОЛЬКО валидным JSON без пояснений и markdown.`,
    messages: [{ role: 'user', content: user }],
  });
  const text = res.content.map((b) => (b.type === 'text' ? b.text : '')).join('');
  return schema.parse(extractJson(text));
}

export async function callText(system: string, user: string): Promise<string> {
  const res = await getClient().messages.create({
    model: MODEL(),
    max_tokens: 2048,
    system: `${system}\n\n${NO_FABRICATION_RULES}`,
    messages: [{ role: 'user', content: user }],
  });
  const t = res.content.map((b) => (b.type === 'text' ? b.text : '')).join('').trim();
  if (!t) throw new Error('Empty model output');
  return t;
}
