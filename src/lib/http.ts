import { NextResponse } from 'next/server';
import { ZodError } from 'zod';

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

/** Оборачивает обработчик: превращает ApiError / ZodError в корректные JSON-ответы. */
export function handler<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    try {
      return await fn(...args);
    } catch (e) {
      if (e instanceof ApiError) return json({ error: e.message }, e.status);
      if (e instanceof ZodError) return json({ error: 'Некорректные данные: ' + e.issues.map((i) => i.message).join('; ') }, 400);
      console.error(e);
      return json({ error: 'Внутренняя ошибка сервера' }, 500);
    }
  };
}
