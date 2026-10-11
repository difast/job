// Мок-сервер GigaChat API для E2E (НЕ настоящая модель). Отвечает по протоколу GigaChat (OAuth + chat/completions)
// детерминированными ответами, построенными из входных данных, и умеет имитировать сбои и «галлюцинации»,
// чтобы проверить серверные проверки Clymly. Управление: GET /__mode?m=ok|500|429|malformed|401, GET /__log, POST /__reset.
import { createServer } from 'node:http';

const words = (s) => (s.toLowerCase().replace(/ё/g, 'е').match(/[a-zа-я0-9]+/g) ?? []).filter((w) => w.length >= 5).map((w) => w.slice(0, 6));
const between = (s, t) => { const m = s.match(new RegExp(`<${t}>\\n([\\s\\S]*?)\\n</${t}>`)); return m ? m[1] : ''; };

function reply(system, user) {
  if (system.includes('Проанализируй резюме кандидата')) {
    const resume = between(user, 'resume');
    if (/договор|рецепт/i.test(resume) && !/опыт работы/i.test(resume)) return { isResume: false, notResumeReason: 'Это не резюме' };
    const bullets = resume.split('\n').filter((l) => /^\s*[-•]/.test(l)).map((l) => l.replace(/^\s*[-•]\s*/, ''));
    return {
      isResume: true, breakdown: { structure: 72, experience: 64, achievements: 48, skills: 58, fit: 61, ats: 70 },
      strengths: [`В опыте указано: «${(bullets[0] ?? 'опыт работы').slice(0, 80)}»`, 'Есть разделы «Опыт работы» и «Образование»'],
      improvements: [
        { title: 'Добавьте измеримые результаты', detail: `Строка «${(bullets[1] ?? bullets[0] ?? '').slice(0, 60)}» описывает обязанность — допишите, к чему это привело.` },
        { title: 'Раздел «О себе»', detail: 'Добавьте 2–3 предложения о том, какую работу ищете.' },
        { title: 'Навыки', detail: 'Сгруппируйте навыки по темам.' },
      ],
      missingSkills: ['SQL'], experienceTips: ['Начинайте пункты опыта с глагола действия'], limitations: [],
    };
  }
  if (system.includes('Сопоставь резюме кандидата с конкретной вакансией')) {
    const vacancy = between(user, 'vacancy'), resume = between(user, 'resume');
    if (!/требован|обязанност/i.test(vacancy)) return { isVacancy: false, notVacancyReason: 'Это не вакансия' };
    const rlines = resume.split('\n').filter((l) => l.trim().length > 8);
    const reqs = vacancy.split('\n').filter((l) => /^\s*[-•]/.test(l)).slice(0, 12).map((l) => {
      const text = l.replace(/^\s*[-•]\s*/, '').trim();
      // «Галлюцинация»: Python отмечается как совпадение с выдуманной цитатой — Clymly должен это отбросить
      if (/python/i.test(text)) return { text, status: 'match', evidence: 'Коммерческая разработка на Python 5 лет', note: '' };
      const w = new Set(words(text));
      const hit = rlines.find((r) => words(r).filter((x) => w.has(x)).length >= 1);
      return hit ? { text, status: 'match', evidence: hit.trim().replace(/^[-•]\s*/, '').slice(0, 150), note: '' } : { text, status: 'missing', evidence: '', note: 'В резюме нет подтверждения' };
    });
    return { isVacancy: true, title: vacancy.split('\n')[0].replace(/^вакансия:\s*/i, '').slice(0, 80), requirements: reqs.length ? reqs : [{ text: 'Опыт работы', status: 'missing', evidence: '', note: '' }], suggestions: ['Опишите смежный опыт, который реально есть в резюме'] };
  }
  if (system.includes('Предложи правки отдельных строк резюме')) {
    const lines = between(user, 'resume_lines').split('\n').map((l) => { const m = l.match(/^(\d+): (.*)$/); return m ? [Number(m[1]), m[2]] : null; }).filter(Boolean);
    const bullets = lines.filter(([, t]) => /^\s*[-•]/.test(t) && !/\d/.test(t)).slice(0, 2);
    const changes = bullets.map(([i, t]) => ({ lineIndex: i, adapted: `${t.trim()}, с вниманием к качеству`, reason: 'Подчёркивает аккуратность, важную для вакансии', section: 'Опыт' }));
    if (bullets[0]) changes.push({ lineIndex: bullets[0][0], adapted: `${bullets[0][1].trim()} и разработка на Python`, reason: 'Добавлен навык из вакансии', section: 'Опыт' }); // должна быть отброшена
    return { changes };
  }
  if (system.includes('напиши сопроводительное письмо')) {
    const name = (user.match(/Имя кандидата для подписи: (.+)/) ?? [])[1] ?? '';
    const resume = between(user, 'resume');
    const b = resume.split('\n').find((l) => /^\s*[-•]/.test(l) && !/\d/.test(l))?.replace(/^\s*[-•]\s*/, '') ?? 'опыт работы из резюме';
    return { text: `Здравствуйте!\n\nМеня заинтересовала ваша вакансия. В моём опыте есть то, что ей отвечает: ${b.toLowerCase()}. Буду рад обсудить, чем могу быть полезен.\n\nС уважением,\n${name}` };
  }
  if (system.includes('Подготовь 5 вопросов')) {
    return { questions: [1, 2, 3, 4, 5].map((i) => ({ text: `Вопрос по вакансии №${i}: расскажите о вашем опыте, связанном с требованиями вакансии?`, category: 'По вакансии', keyPoints: ['Конкретный пример', 'Ваша роль', 'Результат'], sampleAnswer: 'В [компания из вашего резюме] я [что сделали], в результате [результат].', difficulty: 2 })) };
  }
  if (system.includes('Оцени ответ кандидата')) {
    const answer = between(user, 'answer');
    const long = answer.split(/\s+/).length >= 12;
    return {
      criteria: { relevance: long ? 75 : 15, specificity: long ? 60 : 10, structure: long ? 55 : 10, result: long ? 40 : 5 },
      covered: long ? ['Конкретный пример'] : [], missed: ['Результат'],
      summary: long ? 'В ответе есть пример из опыта, но не назван результат.' : 'Ответ слишком короткий и не отвечает на вопрос.',
      tips: ['Назовите результат своих действий'], improvedAnswer: long ? `${answer.trim()} [назовите результат]` : '',
    };
  }
  return { error: 'unknown task' };
}

export function startMockGigaChat({ port = 4200 } = {}) {
  const state = { mode: 'ok', log: [], oauth: 0 };
  const server = createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      const send = (status, data) => res.writeHead(status, { 'Content-Type': 'application/json' }).end(typeof data === 'string' ? data : JSON.stringify(data));
      const url = new URL(req.url, 'http://x');
      if (url.pathname === '/__mode') { state.mode = url.searchParams.get('m') ?? 'ok'; return send(200, { mode: state.mode }); }
      if (url.pathname === '/__log') return send(200, state.log);
      if (url.pathname === '/__reset') { state.log = []; state.mode = 'ok'; return send(200, {}); }
      if (url.pathname === '/api/v2/oauth') {
        state.oauth++;
        if (!/^Basic [A-Za-z0-9+/=]+$/.test(req.headers.authorization ?? '') || !req.headers.rquid || body !== 'scope=GIGACHAT_API_PERS') return send(401, { message: 'Unauthorized' });
        return send(200, { access_token: `mock-token-${state.oauth}-${'z'.repeat(32)}`, expires_at: Date.now() + 30 * 60_000 });
      }
      if (url.pathname === '/api/v1/chat/completions') {
        if (!/^Bearer mock-token-/.test(req.headers.authorization ?? '')) return send(401, { message: 'Token is invalid' });
        const b = JSON.parse(body);
        const system = b.messages[0].content, user = b.messages.at(-1).content;
        const task = system.match(/Задача: ([^.]+)/)?.[1] ?? '?';
        state.log.push({ task, model: b.model, user, system, repair: b.messages.length > 2 });
        if (state.mode === '500') return send(500, { message: 'Internal error' });
        if (state.mode === '429') return send(429, { message: 'Too Many Requests' });
        if (state.mode === '401') return send(401, { message: 'Token has expired' });
        const content = state.mode === 'malformed' ? 'Извините, вот мой ответ без JSON' : (() => { const r = reply(system, b.messages.length > 2 ? b.messages[1].content : user); return r.text ?? JSON.stringify(r); })();
        return send(200, { choices: [{ message: { role: 'assistant', content }, finish_reason: 'stop', index: 0 }], model: `${b.model}:mock`, object: 'chat.completion' });
      }
      send(404, { message: 'not found' });
    });
  });
  return new Promise((resolve) => server.listen(port, () => resolve({ state, close: () => new Promise((r) => server.close(r)) })));
}

if (process.argv[1]?.endsWith('mock-gigachat.mjs')) {
  const port = Number(process.env.PORT ?? 4200);
  await startMockGigaChat({ port });
  console.log(`mock GigaChat on http://localhost:${port}`);
}
