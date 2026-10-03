// Детерминированный движок: работает без внешнего AI и служит запасным вариантом.
// Принцип: ничего не выдумывает — использует только то, что найдено в тексте резюме.
import {
  ACHIEVE_VERB_RE, BULLET_RE, EMAIL_RE, METRIC_RE, PHONE_RE, coverage, detectSections, estimateYears, keyStems,
  lines, norm, stemSet, stripBullet, tokens, words,
} from '../text';
import type {
  AnswerFeedback, Change, LetterStyle, ProfessionContext, ReqStatus, ResumeAnalysis, VacancyAnalysis,
} from '../types';
import { LEVEL_SHORT } from '../types';

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));
const trunc = (s: string, n = 90) => (s.length > n ? s.slice(0, n - 1).trim() + '…' : s);

function resumeFacts(text: string) {
  const ls = lines(text);
  const sections = detectSections(ls);
  const bulletLines = ls.filter((l) => BULLET_RE.test(l) && words(l) >= 4);
  const bodyLines = ls.filter((l) => words(l) >= 5);
  const achLines = bodyLines.filter((l) => METRIC_RE.test(l) || (ACHIEVE_VERB_RE.test(l) && /\d/.test(l)));
  const verbLines = bodyLines.filter((l) => ACHIEVE_VERB_RE.test(l));
  const n = norm(text);
  return { ls, sections, bulletLines, bodyLines, achLines, verbLines, n, st: stemSet(text), years: estimateYears(text), wordCount: words(text) };
}

export function analyzeResumeHeuristic(text: string, p: ProfessionContext): ResumeAnalysis {
  const f = resumeFacts(text);
  const hasEmail = EMAIL_RE.test(text), hasPhone = PHONE_RE.test(text);

  // Структура
  let structure = 0;
  if (hasEmail || hasPhone) structure += 20;
  if (hasEmail && hasPhone) structure += 5;
  if ('experience' in f.sections) structure += 25;
  if ('education' in f.sections) structure += 15;
  if ('skills' in f.sections) structure += 20;
  if ('summary' in f.sections) structure += 10;
  if (f.wordCount >= 150 && f.wordCount <= 1000) structure += 5;

  // Навыки
  const matchedSkills = p.skills.filter((s) => coverage(s, f.n, f.st) >= 0.99);
  const missingSkills = p.skills.filter((s) => !matchedSkills.includes(s));
  const skillsRatio = p.skills.length ? matchedSkills.length / p.skills.length : 0;
  const skills = clamp((skillsRatio / 0.55) * 100);

  // Достижения
  const bodyCount = Math.max(f.bodyLines.length, 1);
  const achRatio = f.achLines.length / bodyCount;
  const achievements = clamp((achRatio / 0.3) * 80 + Math.min(f.achLines.length, 4) * 5);

  // Опыт: стаж относительно уровня + насыщенность описаниями
  let expYears = 40;
  if (f.years !== null) {
    const target = p.yearsFrom;
    expYears = f.years >= target ? 85 + Math.min(15, (f.years - target) * 3) : (f.years / Math.max(target, 1)) * 85;
    if (p.yearsFrom === 0) expYears = Math.max(expYears, 70);
  } else if (p.level === 'junior') expYears = 55;
  const richness = Math.min(f.bulletLines.length + f.verbLines.length / 2, 10) / 10;
  const experience = clamp(expYears * 0.6 + richness * 40);

  // Соответствие профессии
  const nameHit = [p.name, p.nameEn ?? ''].some((nm) => nm && coverage(nm, f.n, f.st) >= 0.99) ? 1 : 0;
  const reqCov = p.requirements.length ? p.requirements.reduce((a, r) => a + coverage(r, f.n, f.st), 0) / p.requirements.length : 0;
  const fit = clamp(skills * 0.45 + reqCov * 100 * 0.35 + nameHit * 20 + (f.years !== null && f.years >= p.yearsFrom ? 5 : 0));

  // ATS
  let ats = 40;
  if (hasEmail) ats += 12;
  if (hasPhone) ats += 8;
  const stdHeads = ['experience', 'education', 'skills'].filter((k) => k in f.sections).length;
  ats += stdHeads * 8;
  if (f.years !== null || /(19|20)\d{2}/.test(text)) ats += 6;
  if (f.wordCount >= 250 && f.wordCount <= 900) ats += 6;
  else if (f.wordCount < 120) ats -= 15;
  const weird = (text.match(/[│┃║■□▲▼◆◇★☆✓✔→]/g) ?? []).length + (text.match(/\t{2,}/g) ?? []).length;
  ats -= Math.min(weird * 2, 15);
  ats = clamp(ats);

  const breakdown = { structure: clamp(structure), experience, achievements, skills, fit, ats };
  const score = clamp(
    breakdown.structure * 0.15 + breakdown.experience * 0.2 + breakdown.achievements * 0.2 +
    breakdown.skills * 0.15 + breakdown.fit * 0.2 + breakdown.ats * 0.1,
  );

  // Сильные стороны
  const strengths: string[] = [];
  if (matchedSkills.length >= 3) strengths.push(`Есть ключевые навыки профессии «${p.name}»: ${matchedSkills.slice(0, 5).join(', ')}.`);
  if (f.achLines.length >= 2) strengths.push(`В резюме есть измеримые результаты (${f.achLines.length} пункт(а) с цифрами) — это сильно повышает доверие.`);
  if (f.years !== null && f.years >= p.yearsFrom && p.yearsFrom > 0) strengths.push(`Стаж (~${f.years} лет) соответствует уровню ${LEVEL_SHORT[p.level]}.`);
  if (stdHeads === 3) strengths.push('Понятная структура: опыт, образование и навыки выделены отдельными разделами.');
  if (hasEmail && hasPhone) strengths.push('Указаны контактные данные — рекрутеру легко связаться.');
  if (nameHit) strengths.push(`Целевая роль «${p.name}» прямо читается в тексте резюме.`);
  if (!strengths.length) strengths.push('Резюме содержит базовую информацию, на которой можно построить сильную версию.');

  // Что улучшить: берём самые слабые зоны
  const improvements: { title: string; detail: string }[] = [];
  const weakAch = f.bodyLines.filter((l) => !METRIC_RE.test(l) && BULLET_RE.test(l)).slice(0, 2);
  const add = (cond: boolean, title: string, detail: string) => { if (cond) improvements.push({ title, detail }); };
  add(breakdown.achievements < 70, 'Добавьте измеримые результаты',
    `Только ${f.achLines.length} из ${bodyCount} строк содержат цифры. ${weakAch.length ? `Например, «${trunc(stripBullet(weakAch[0]))}» — добавьте масштаб, срок или результат (если они у вас были).` : 'К каждому ключевому пункту опыта добавьте метрику: %, сумму, сроки, число людей/клиентов.'}`);
  add(!('summary' in f.sections), 'Добавьте раздел «О себе»', `2–3 строки: роль «${p.name}», уровень ${LEVEL_SHORT[p.level]}, ключевой опыт и главный результат. Только факты из вашей карьеры.`);
  add(!('skills' in f.sections), 'Выделите блок «Навыки»', 'Отдельный список ключевых навыков помогает ATS и рекрутеру быстро оценить стек.');
  add(!(hasEmail && hasPhone), 'Проверьте контакты', `Не найден${!hasEmail ? ' e-mail' : ''}${!hasEmail && !hasPhone ? ' и' : ''}${!hasPhone ? ' телефон' : ''}. Укажите их в верхней части резюме.`);
  add(!('education' in f.sections), 'Добавьте образование', 'Раздел «Образование» ожидается ATS и рекрутерами, даже если вы его кратко опишете.');
  add(breakdown.skills < 60 && missingSkills.length > 0, 'Раскройте навыки профессии',
    `Для «${p.name}» ждут: ${missingSkills.slice(0, 4).join(', ')}. Если вы ими владеете — добавьте в резюме с примерами применения.`);
  add(breakdown.fit < 65, 'Усильте соответствие профессии', `Переформулируйте опыт в терминах «${p.name}»: используйте профессиональную лексику и покажите задачи уровня ${LEVEL_SHORT[p.level]} — ${p.levelSummary.replace(/^[^:]+:\s*/, '')}`);
  add(f.wordCount < 200, 'Резюме слишком короткое', 'Расскажите подробнее о ролях и результатах: 3–5 пунктов на каждое место работы.');
  add(f.wordCount > 1000, 'Резюме слишком длинное', 'Сократите до 1–2 страниц: оставьте самые релевантные позиции и результаты.');
  add(f.years === null, 'Укажите периоды работы', 'Не нашли диапазоны дат («2021 – 2024»). Укажите периоды по каждому месту работы.');
  const topImprovements = improvements.slice(0, 5);
  const filler = [
    { title: 'Подстройте резюме под конкретную вакансию', detail: 'Используйте раздел «Вакансии»: мы сравним требования и предложим точечные правки без выдуманных фактов.' },
    { title: 'Поставьте самое релевантное в начало', detail: `Для «${p.name}» расположите сверху позиции и результаты, ближе всего к задачам уровня ${LEVEL_SHORT[p.level]}.` },
    { title: 'Проверьте единообразие оформления', detail: 'Одинаковый формат дат, названий должностей и маркеров делает резюме аккуратнее и лучше читается ATS.' },
  ];
  for (const f of filler) if (topImprovements.length < 3) topImprovements.push(f);

  const experienceTips: string[] = [];
  experienceTips.push(`Для уровня ${LEVEL_SHORT[p.level]} покажите: ${p.levelSummary.replace(/^[^:]+:\s*/, '').replace(/\.$/, '')}.`);
  if (weakAch.length) experienceTips.push(`Переформулируйте по схеме «действие → результат»: «${trunc(stripBullet(weakAch[0]), 70)}».`);
  experienceTips.push('Начинайте пункты с глаголов результата: «запустил», «сократил», «увеличил», «выстроил».');

  return { score, breakdown, strengths: strengths.slice(0, 5), improvements: topImprovements, missingSkills: missingSkills.slice(0, 8), experienceTips, engine: 'heuristic' };
}

// ───────── Вакансия ─────────

const REQ_HEAD = /^(требования|мы ожидаем|ожидания|что нужно|что мы ждем|что мы ждём|вы нам подойдете|вы нам подойдёте|ты нам подходишь|нам важно|requirements|qualifications|must have|what we expect|от вас|от кандидата)\b/i;
const OTHER_HEAD = /^(обязанности|задачи|чем предстоит заниматься|что предстоит делать|условия|мы предлагаем|что мы предлагаем|предлагаем|о компании|о нас|responsibilities|we offer|benefits|nice to have|будет плюсом|плюсом будет)\b/i;

export function extractVacancyTitle(text: string): string {
  const first = lines(text).map((l) => l.trim()).find((l) => l.length > 2);
  if (!first) return 'Вакансия';
  const m = first.match(/^(?:вакансия|position|должность)\s*[:\-–]\s*(.+)$/i);
  const t = (m ? m[1] : first).replace(/[#*]/g, '').trim();
  return t.length <= 90 ? t : 'Вакансия';
}

export function extractCompany(text: string): string | null {
  const m = text.match(/(?:компания|company|работодатель)\s*[:\-–]\s*([^\n,.]{2,60})/i) ?? text.match(/\b(?:в компанию|в компании)\s+[«"“]?([A-ZА-Я][\w\-& ]{1,40})[»"”]?/);
  return m ? m[1].trim() : null;
}

export function extractRequirementLines(text: string): string[] {
  const ls = lines(text).map((l) => l.trim());
  const out: string[] = [];
  let mode: 'none' | 'req' | 'other' = 'none';
  for (const l of ls) {
    if (!l) continue;
    const head = l.replace(/[:：]\s*$/, '');
    if (!BULLET_RE.test(l) && l.length < 60) {
      if (REQ_HEAD.test(head)) { mode = 'req'; continue; }
      if (OTHER_HEAD.test(head)) { mode = 'other'; continue; }
    }
    if (mode === 'req') out.push(stripBullet(l));
  }
  if (out.length < 2) {
    // нет явного блока — берём маркированные строки либо предложения с маркерами требований
    const bullets = ls.filter((l) => BULLET_RE.test(l)).map(stripBullet);
    const sent = text.split(/[.;\n]/).map((s) => s.trim()).filter((s) => /(опыт|знани|умени|владени|навык|английск|от \d|\d\+? (лет|год))/i.test(s));
    out.splice(0, out.length, ...(bullets.length >= 2 ? bullets : sent));
  }
  return [...new Set(out.map((s) => s.replace(/[;.]$/, '').trim()).filter((s) => s.length > 3 && s.length < 220))].slice(0, 12);
}

const CEFR = ['a1', 'a2', 'b1', 'b2', 'c1', 'c2'];

function evaluateRequirement(req: string, resumeText: string, f: ReturnType<typeof resumeFacts>, p: ProfessionContext): { status: ReqStatus; note?: string; evidence?: string } {
  const r = norm(req);
  const yearsM = r.match(/(?:от\s*)?(\d+)\s*\+?\s*(?:-\s*\d+\s*)?(?:лет|года|год|years|yrs)/);
  if (yearsM) {
    const need = +yearsM[1];
    if (f.years === null) return { status: 'partial', note: 'Не удалось определить стаж по датам в резюме' };
    if (f.years >= need) return { status: 'match', note: `Стаж по резюме ~${f.years} лет` };
    if (f.years >= need - 1) return { status: 'partial', note: `Стаж по резюме ~${f.years} лет, нужно ${need}+` };
    return { status: 'missing', note: `Стаж по резюме ~${f.years} лет, нужно ${need}+` };
  }
  if (/английск|english/.test(r)) {
    const has = /английск|english/.test(f.n);
    const need = (r.match(/\b([abc][12])\b/) ?? [])[1];
    const have = (f.n.match(/(?:английск\w*|english)[^\n]{0,30}?\b([abc][12])\b/) ?? [])[1] ?? (f.n.match(/\b([abc][12])\b[^\n]{0,15}(?:английск|english)/) ?? [])[1];
    if (!has) return { status: 'missing', note: 'Английский язык в резюме не указан' };
    if (need && have) return CEFR.indexOf(have) >= CEFR.indexOf(need) ? { status: 'match', note: `Указан уровень ${have.toUpperCase()}` } : { status: 'partial', note: `Указан ${have.toUpperCase()}, нужно ${need.toUpperCase()}` };
    if (need && !have) return { status: 'partial', note: 'Английский указан без уровня' };
    return { status: 'match' };
  }
  // общий случай: ключевые термины (навыки профессии + остальные значимые слова)
  const known = p.skills.filter((s) => coverage(s, r, stemSet(req)) >= 0.99);
  const terms = known.length ? known : [];
  const ks = keyStems(req);
  let ratio: number;
  if (terms.length) {
    ratio = terms.reduce((a, t) => a + coverage(t, f.n, f.st), 0) / terms.length;
  } else {
    ratio = ks.length ? ks.filter((k) => f.st.has(k)).length / ks.length : 0;
  }
  const evidence = f.bodyLines.find((l) => {
    const ln = stemSet(l);
    const pool = terms.length ? terms.flatMap((t) => keyStems(t)) : ks;
    return pool.length > 0 && pool.some((k) => ln.has(k));
  });
  if (ratio >= 0.7) return { status: 'match', evidence };
  if (ratio >= 0.3) return { status: 'partial', evidence };
  return { status: 'missing' };
}

export function analyzeVacancyHeuristic(vacancyText: string, resumeText: string, p: ProfessionContext): VacancyAnalysis {
  const f = resumeFacts(resumeText);
  const reqs = extractRequirementLines(vacancyText);
  const evaluated = reqs.map((text) => ({ text, ...evaluateRequirement(text, resumeText, f, p) }));
  const n = evaluated.length;
  const pts = evaluated.reduce((a, e) => a + (e.status === 'match' ? 1 : e.status === 'partial' ? 0.5 : 0), 0);
  let matchScore = n ? clamp((pts / n) * 100) : 0;
  if (!n) {
    // требований не нашли — оцениваем по пересечению ключевых слов
    const vs = keyStems(vacancyText);
    matchScore = vs.length ? clamp((vs.filter((k) => f.st.has(k)).length / vs.length) * 120) : 0;
  }
  const present = evaluated.filter((e) => e.status === 'match').map((e) => e.evidence ? `${e.text} — «${trunc(stripBullet(e.evidence), 80)}»` : e.text);
  const missing = evaluated.filter((e) => e.status === 'missing').map((e) => e.text);
  const partial = evaluated.filter((e) => e.status === 'partial');
  const suggestions: string[] = [];
  for (const e of partial.slice(0, 3)) suggestions.push(`Раскройте подробнее: «${trunc(e.text, 80)}» — если этот опыт у вас есть, добавьте конкретный пример и результат.`);
  for (const e of evaluated.filter((x) => x.status === 'match' && !x.evidence).slice(0, 1)) suggestions.push(`Вынесите ближе к началу резюме то, что подтверждает: «${trunc(e.text, 80)}».`);
  if (missing.length) suggestions.push('По отсутствующим требованиям не добавляйте то, чего не было: лучше укажите смежный опыт или то, что вы изучаете.');
  if (!suggestions.length) suggestions.push('Резюме хорошо соответствует требованиям — поставьте релевантные пункты опыта в начало.');
  return {
    title: extractVacancyTitle(vacancyText), matchScore, requirements: evaluated.map(({ text, status, note }) => ({ text, status, note })),
    present, missing, suggestions, engine: 'heuristic',
  };
}

// ───────── Адаптация резюме ─────────

const WEAK_VERBS: [RegExp, string][] = [
  [/^(\s*(?:[-•*·–—]\s+)?)Занимался\s+/, '$1Отвечал за '],
  [/^(\s*(?:[-•*·–—]\s+)?)Занималась\s+/, '$1Отвечала за '],
];

export function adaptResumeHeuristic(resumeText: string, vacancyText: string, vacancy: VacancyAnalysis, p: ProfessionContext): Change[] {
  const ls = lines(resumeText);
  const f = resumeFacts(resumeText);
  const changes: Change[] = [];
  let id = 1;
  const nid = () => `c${id++}`;

  // термины вакансии, подтверждённые резюме
  const vst = stemSet(vacancyText);
  const vacancyTerms = p.skills.filter((s) => coverage(s, norm(vacancyText), vst) >= 0.99);
  const confirmed = vacancyTerms.filter((s) => coverage(s, f.n, f.st) >= 0.99);

  // 1) Блок навыков: релевантные вакансии — вперёд (состав не меняется)
  const skillsIdx = f.sections.skills;
  if (skillsIdx !== undefined) {
    for (let i = skillsIdx + 1; i < Math.min(ls.length, skillsIdx + 4); i++) {
      const line = ls[i];
      if (!line.trim()) continue;
      if (detectSections([line])['experience'] !== undefined) break;
      const parts = stripBullet(line).split(/\s*[,;•|]\s*/).map((s) => s.trim()).filter(Boolean);
      if (parts.length < 3) continue;
      const rel = (s: string) => (vacancyTerms.some((t) => coverage(t, norm(s), stemSet(s)) >= 0.99 || coverage(s, norm(t), stemSet(t)) >= 0.99) ? 0 : 1);
      const sorted = [...parts].sort((a, b) => rel(a) - rel(b));
      if (sorted.join('|') !== parts.join('|')) {
        const sep = line.includes(';') ? '; ' : ', ';
        const prefix = (line.match(BULLET_RE) ?? [''])[0];
        changes.push({
          id: nid(), kind: 'replace', lineIndex: i, section: 'Навыки', original: line, adapted: prefix + sorted.join(sep),
          reason: 'Навыки, которые прямо упомянуты в вакансии, поставлены первыми. Состав навыков не изменён.', status: 'pending',
        });
      }
      break;
    }
  }

  // 2) Усиление формулировок (без смены фактов)
  const expStart = f.sections.experience ?? 0;
  for (let i = expStart; i < ls.length && changes.filter((c) => c.section === 'Опыт').length < 4; i++) {
    for (const [re, rep] of WEAK_VERBS) {
      if (re.test(ls[i])) {
        changes.push({
          id: nid(), kind: 'replace', lineIndex: i, section: 'Опыт', original: ls[i], adapted: ls[i].replace(re, rep),
          reason: 'Сильнее и конкретнее: акцент на зоне ответственности, а не на процессе.', status: 'pending',
        });
        break;
      }
    }
  }

  // 3) Профиль-«шапка» только из подтверждённых фактов, если раздела «О себе» нет
  if (!('summary' in f.sections) && confirmed.length >= 2) {
    const title = vacancy.title !== 'Вакансия' ? vacancy.title : p.name;
    const insertAfter = ls.findIndex((l) => l.trim().length > 0);
    changes.push({
      id: nid(), kind: 'insert', lineIndex: insertAfter, section: 'О себе', original: '',
      adapted: `Целевая позиция: ${title}.\nКлючевой опыт, релевантный вакансии: ${confirmed.slice(0, 5).join(', ')}.`,
      reason: 'Короткий профиль, собранный только из навыков, которые уже есть в вашем резюме и востребованы в вакансии.', status: 'pending',
    });
  }
  return changes;
}

// ───────── Сопроводительное письмо ─────────

export interface LetterInput {
  userName: string;
  vacancyTitle: string;
  company: string | null;
  p: ProfessionContext;
  resumeText: string;
  vacancyText: string;
  variant: number;
}

const pick = <T,>(arr: T[], v: number) => arr[v % arr.length];

export function letterHeuristic(style: LetterStyle, i: LetterInput): string {
  const f = resumeFacts(i.resumeText);
  const vst = stemSet(i.vacancyText);
  const skills = i.p.skills.filter((s) => coverage(s, norm(i.vacancyText), vst) >= 0.99 && coverage(s, f.n, f.st) >= 0.99).slice(0, 4);
  const generic = i.p.skills.filter((s) => coverage(s, f.n, f.st) >= 0.99).slice(0, 4);
  const useSkills = skills.length ? skills : generic;
  const ach = f.achLines.map(stripBullet).filter((l) => l.length < 200).slice(0, 2);
  const years = f.years && f.years > 0 ? `${f.years} ${f.years === 1 ? 'год' : f.years < 5 ? 'года' : 'лет'}` : null;
  const to = i.company ? `Здравствуйте! Меня зовут ${i.userName}, и я хочу откликнуться на вакансию «${i.vacancyTitle}» в компании ${i.company}.` : `Здравствуйте! Меня зовут ${i.userName}, и я хочу откликнуться на вакансию «${i.vacancyTitle}».`;
  const lvl = LEVEL_SHORT[i.p.level];
  const skillsTxt = useSkills.length ? useSkills.join(', ') : '';
  const bye = pick(['Буду рад(а) обсудить, чем могу быть полезен(на) вашей команде.', 'С удовольствием отвечу на вопросы и расскажу подробнее на встрече.', 'Готов(а) обсудить детали в удобное для вас время.'], i.variant);

  const closing = pick(['С уважением,', 'Всего доброго,', 'Благодарю за внимание,', 'С наилучшими пожеланиями,'], i.variant);
  const lead = pick(['', 'Коротко о главном. '], i.variant + 1);
  if (style === 'short') {
    return [
      to,
      `Я ${i.p.name.toLowerCase()} уровня ${lvl}${years ? `, мой опыт — около ${years}` : ''}.${skillsTxt ? ` В работе использую: ${skillsTxt} — это совпадает с требованиями вакансии.` : ''}${ach[0] ? ` Например: ${ach[0].replace(/[.;]$/, '')}.` : ''}`,
      bye,
      `${closing}\n${i.userName}`,
    ].join('\n\n');
  }
  if (style === 'personal') {
    return [
      to,
      pick([
        `Мне близка работа в роли «${i.p.name}»: ${i.p.description.charAt(0).toLowerCase()}${i.p.description.slice(1)} Именно такие задачи вдохновляют меня в профессии.`,
        `Я выбрал(а) профессию «${i.p.name}», потому что мне нравится видеть реальный результат своей работы. Ваша вакансия — как раз такая возможность.`,
      ], i.variant),
      `${years ? `За ${years} работы ` : 'В своей работе '}я научился(ась) ${skillsTxt ? `уверенно использовать ${skillsTxt}` : 'доводить задачи до результата'}.${ach.length ? ` Моя гордость — ${ach.map((a) => a.replace(/[.;]$/, '')).join('; ')}.` : ''}`,
      `Мне хочется приносить пользу команде не только навыками, но и подходом: договариваться, учиться и брать ответственность за результат. ${bye}`,
      `${pick(['С теплом,', 'С уважением и интересом к вашей команде,'], i.variant)}\n${i.userName}`,
    ].join('\n\n');
  }
  return [
    to,
    `${lead}Мой профиль — ${i.p.name.toLowerCase()} (${lvl})${years ? ` с опытом около ${years}` : ''}. ${i.p.levelSummary.replace(/^[^:]+:\s*/, '').replace(/^./, (c) => c.toUpperCase())}`,
    `${skillsTxt ? `Мой опыт соответствует ключевым требованиям вашей вакансии: ${skillsTxt}.` : 'Моё резюме прилагаю — в нём подробно описан релевантный опыт.'}${ach.length ? ` Среди результатов:\n${ach.map((a) => `— ${a.replace(/[.;]$/, '')}`).join('\n')}` : ''}`,
    `Мне интересна позиция «${i.vacancyTitle}»${i.company ? ` в ${i.company}` : ''}, так как она позволяет применить мой опыт в задачах, где важны ответственность и результат. ${bye}`,
    `${closing}\n${i.userName}`,
  ].join('\n\n');
}

// ───────── Оценка ответа на собеседовании ─────────

export function feedbackHeuristic(answer: string, keyPoints: string[], category: string): AnswerFeedback {
  const st = stemSet(answer), an = norm(answer);
  const covered: string[] = [], missed: string[] = [];
  for (const kp of keyPoints) {
    const ks = keyStems(kp);
    const hit = ks.length ? ks.filter((k) => st.has(k)).length / ks.length : 0;
    (hit >= 0.4 || coverage(kp, an, st) >= 0.99 ? covered : missed).push(kp);
  }
  const wc = words(answer);
  const hasNumbers = /\d/.test(answer);
  const hasExample = /(например|в проекте|в компании|когда я|у нас|я запустил|я сделал|я провел|я провёл|в результате|получилось|итог)/i.test(answer);
  const star = /(ситуаци|задач|действи|результат)/i.test(answer);
  const behavioral = /(поведен|конфликт|неудач|знакомство)/i.test(category) || true;
  const coverageScore = keyPoints.length ? covered.length / keyPoints.length : 0.5;
  const lenScore = wc < 15 ? 0.1 : wc < 40 ? 0.5 : wc <= 220 ? 1 : 0.7;
  let score = coverageScore * 55 + lenScore * 20 + (hasNumbers ? 10 : 0) + (hasExample ? 10 : 0) + (star && behavioral ? 5 : 0);
  if (wc < 8) score = Math.min(score, 15);
  score = clamp(score);
  const tips: string[] = [];
  if (wc < 40) tips.push('Ответ слишком короткий: раскройте мысль на 40–150 слов и приведите пример.');
  if (wc > 220) tips.push('Ответ длинноват — сократите до главного: 1–2 минуты на устный ответ.');
  if (!hasExample) tips.push('Добавьте конкретный пример из вашего опыта («В проекте X я …»).');
  if (!hasNumbers) tips.push('Подкрепите ответ цифрами: масштаб, сроки, результат в процентах или деньгах.');
  if (missed.length) tips.push(`Не хватает: ${missed.slice(0, 2).join('; ')}.`);
  if (!tips.length) tips.push('Хороший, структурный ответ. Потренируйтесь произносить его вслух за 1–2 минуты.');
  return { score, covered, missed, tips: tips.slice(0, 4), engine: 'heuristic' };
}

export { tokens };
