export type LevelKey = 'junior' | 'middle' | 'senior' | 'lead';
export type InterviewType = 'hr' | 'professional' | 'manager';
export type LetterStyle = 'professional' | 'short' | 'personal';

export const LEVEL_LABELS: Record<LevelKey, string> = {
  junior: 'Junior', middle: 'Middle', senior: 'Senior', lead: 'Lead / Руководитель',
};
export const LEVEL_SHORT: Record<LevelKey, string> = { junior: 'Junior', middle: 'Middle', senior: 'Senior', lead: 'Lead' };
export const LEVELS: LevelKey[] = ['junior', 'middle', 'senior', 'lead'];

export const INTERVIEW_TYPE_LABELS: Record<InterviewType, string> = {
  hr: 'HR', professional: 'Профессиональное', manager: 'Руководитель',
};
export const STYLE_LABELS: Record<LetterStyle, string> = {
  professional: 'Профессиональный', short: 'Краткий', personal: 'Более персональный',
};

export const isLevel = (v: unknown): v is LevelKey => typeof v === 'string' && (LEVELS as string[]).includes(v);

export interface ProfessionContext {
  id: string;
  name: string;
  nameEn: string | null;
  description: string;
  skills: string[];
  requirements: string[];
  level: LevelKey;
  levelSummary: string;
  levelExpectations: string[];
  yearsFrom: number;
  yearsTo: number | null;
}

export interface ResumeAnalysis {
  score: number;
  breakdown: { structure: number; experience: number; achievements: number; skills: number; fit: number; ats: number };
  strengths: string[];
  improvements: { title: string; detail: string }[];
  missingSkills: string[];
  experienceTips: string[];
  engine: Engine;
}

export type Engine = 'llm' | 'heuristic';
export type ReqStatus = 'match' | 'partial' | 'missing';

export interface VacancyAnalysis {
  title: string;
  matchScore: number;
  requirements: { text: string; status: ReqStatus; note?: string }[];
  present: string[];
  missing: string[];
  suggestions: string[];
  engine: Engine;
}

export interface Change {
  id: string;
  kind: 'replace' | 'insert';
  lineIndex: number; // replace: индекс строки; insert: вставка после строки lineIndex (-1 = в начало)
  section: string;
  original: string;
  adapted: string;
  reason: string;
  status: 'pending' | 'accepted' | 'rejected';
  edited?: string; // ручная правка пользователя поверх предложения
}

export interface AnswerFeedback {
  score: number;
  covered: string[];
  missed: string[];
  tips: string[];
  engine: Engine;
}

export const parseJson = <T>(s: string, fallback: T): T => {
  try { return JSON.parse(s) as T; } catch { return fallback; }
};
