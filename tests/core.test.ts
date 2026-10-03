import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { introducesNewFacts } from '../src/lib/ai/guard';
import { adaptResumeHeuristic, analyzeResumeHeuristic, analyzeVacancyHeuristic, extractRequirementLines, feedbackHeuristic } from '../src/lib/ai/heuristic';
import { applyChanges, diffWords } from '../src/lib/changes';
import { estimateYears } from '../src/lib/text';
import { categories } from '../prisma/data/professions';
import { questions } from '../prisma/data/questions';
import type { ProfessionContext } from '../src/lib/types';

const resume = readFileSync('tests/fixtures/resume.txt', 'utf8');
const vacancy = readFileSync('tests/fixtures/vacancy.txt', 'utf8');
const pm = categories.flatMap((c) => c.professions).find((p) => p.id === 'product-manager')!;
const ctx: ProfessionContext = {
  id: pm.id, name: pm.name, nameEn: pm.nameEn ?? null, description: pm.description, skills: pm.skills, requirements: pm.requirements,
  level: 'middle', levelSummary: 'Middle: ' + pm.levels.middle, levelExpectations: [], yearsFrom: 2, yearsTo: 5,
};

test('estimateYears объединяет периоды и понимает «н.в.»', () => {
  assert.equal(estimateYears('2019 – 2021 и 2021 – н.в.', new Date('2024-06-01')), 5);
  assert.equal(estimateYears('нет дат'), null);
});

test('guard блокирует выдуманные числа, технологии и названия', () => {
  const src = 'Запустил приложение, 50 000 пользователей, использовал SQL';
  assert.equal(introducesNewFacts(src, 'Запустил приложение для 50 000 пользователей, использовал SQL'), null);
  assert.match(introducesNewFacts(src, 'Запустил приложение, 80 000 пользователей') ?? '', /число/);
  assert.match(introducesNewFacts(src, 'Запустил приложение, использовал SQL и Kubernetes') ?? '', /kubernetes/);
  assert.match(introducesNewFacts('Работал в проекте над платформой', 'Работал в проекте над платформой, Яндекс') ?? '', /яндек/);
});

test('анализ резюме: оценки в диапазоне, 3–5 рекомендаций', () => {
  const a = analyzeResumeHeuristic(resume, ctx);
  for (const v of [a.score, ...Object.values(a.breakdown)]) assert.ok(v >= 0 && v <= 100);
  assert.ok(a.improvements.length >= 3 && a.improvements.length <= 5);
  const weak = analyzeResumeHeuristic('Иван\nХочу работать', ctx);
  assert.ok(weak.score < a.score - 20, 'слабое резюме оценивается заметно ниже');
});

test('анализ вакансии: требования, статусы и итог', () => {
  assert.ok(extractRequirementLines(vacancy).length >= 5);
  const v = analyzeVacancyHeuristic(vacancy, resume, ctx);
  const by = (re: RegExp) => v.requirements.find((r) => re.test(r.text))!;
  assert.equal(by(/3 лет/).status, 'match');
  assert.equal(by(/Kubernetes/).status, 'missing');
  assert.equal(by(/английск/i).status, 'match'); // B2 в резюме, требуется B2+
  assert.ok(v.matchScore > 30 && v.matchScore < 95);
  assert.ok(v.missing.some((m) => /Kubernetes/.test(m)));
});

test('адаптация не вносит новых фактов и применяется корректно', () => {
  const a = analyzeVacancyHeuristic(vacancy, resume, ctx);
  const ch = adaptResumeHeuristic(resume, vacancy, a, ctx);
  assert.ok(ch.length > 0);
  for (const c of ch) if (c.kind === 'replace') assert.equal(introducesNewFacts(c.original, c.adapted), null, c.adapted);
  const none = applyChanges(resume, ch);
  assert.equal(none, resume, 'без принятых правок текст не меняется');
  const all = applyChanges(resume, ch.map((c) => ({ ...c, status: 'accepted' as const })));
  assert.notEqual(all, resume);
  const edited = applyChanges(resume, [{ ...ch[0], status: 'accepted', edited: 'ПРАВКА' }]);
  assert.ok(edited.includes('ПРАВКА'));
});

test('diffWords отмечает вставки и удаления', () => {
  const d = diffWords('Занималась задачей', 'Отвечала за задачей');
  assert.ok(d.some((p) => p.type === 'del' && p.text.includes('Занималась')));
  assert.ok(d.some((p) => p.type === 'ins' && p.text.includes('Отвечала')));
});

test('оценка ответа: сильный > слабый', () => {
  const kp = ['Гипотеза и целевая метрика до запуска', 'Статистическая значимость', 'Guardrail-метрики и принятие решения'];
  const good = feedbackHeuristic('Перед тестом я фиксирую гипотезу и целевую метрику. Затем проверяю статистическую значимость и guardrail-метрики, после чего принимаю решение. Например, в проекте конверсия выросла на 12%, и мы выкатили изменение.', kp, 'Эксперименты');
  const bad = feedbackHeuristic('не знаю', kp, 'Эксперименты');
  assert.ok(good.score > bad.score + 40);
  assert.equal(good.missed.length, 0);
});

test('справочники: 38 профессий, у каждой данные и 4 уровня; вопросы валидны', () => {
  const all = categories.flatMap((c) => c.professions);
  assert.equal(all.length, 38);
  assert.equal(new Set(all.map((p) => p.id)).size, 38);
  for (const p of all) {
    assert.ok(p.description && p.skills.length >= 5 && p.requirements.length >= 3, p.id);
    for (const l of ['junior', 'middle', 'senior', 'lead'] as const) assert.ok(p.levels[l], `${p.id}:${l}`);
  }
  const ids = new Set(all.map((p) => p.id));
  for (const q of questions) {
    assert.ok(q.professionId === null || ids.has(q.professionId), q.text);
    assert.ok(q.keyPoints.length >= 2 && q.sampleAnswer && q.category, q.text);
  }
});

test('требования выделяются из блока «Требования» — без обязанностей и условий (кириллица в границах слов)', () => {
  const reqs = extractRequirementLines(vacancy);
  assert.equal(reqs.length, 6);
  assert.ok(!reqs.some((r) => /Гибрид|ДМС|Управлять roadmap|Работать с командой/.test(r)));
});

test('стаж считается по разделу «Опыт», годы учёбы не входят', () => {
  const a = analyzeVacancyHeuristic('Требования:\n- Опыт от 10 лет\n- SQL', resume, ctx);
  assert.equal(a.requirements[0].status, 'missing'); // ~7 лет по опыту, а не 11 с учётом образования
});
