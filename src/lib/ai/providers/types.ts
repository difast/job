// Общий интерфейс ИИ-провайдера: AI-функции Clymly не зависят от конкретного API.

export interface ChatRequest {
  system: string; // системные инструкции
  user: string; // данные задачи (резюме, вакансия и т. п.), размеченные тегами
  json?: boolean; // ожидается JSON-объект
  jsonSchema?: Record<string, unknown>; // JSON Schema ответа — если провайдер поддерживает структурированный вывод
  maxTokens?: number;
  temperature?: number;
  history?: { role: 'user' | 'assistant'; content: string }[]; // предыдущие реплики (повторная попытка исправить формат)
}

export interface ChatResult {
  text: string;
  finishReason: string | null;
  model: string | null;
}

export interface AiProvider {
  name: 'gigachat' | 'anthropic';
  model: string;
  chat(req: ChatRequest): Promise<ChatResult>;
}
