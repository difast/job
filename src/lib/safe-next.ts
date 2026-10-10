/** Безопасный внутренний адрес для возврата после входа/регистрации (без открытых редиректов). */
export const safeNext = (next: string | null | undefined) => (next && next.startsWith('/') && !next.startsWith('//') && !next.includes('\\') ? next : null);
