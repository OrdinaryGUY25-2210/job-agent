import { MATCH_TIERS_THRESHOLD } from '@jobagent/types';
import { explodeKeywords } from '@jobagent/shared';

export interface MatchableJob {
  title: string;
  company?: string;
  location?: string;
  description?: string;
  requirements?: string[];
  salaryMin?: number | null;
  salaryMax?: number | null;
  salaryText?: string;
  employmentType?: string;
}

export interface MatchableProfile {
  skills: string[];
  locations: string[];
  remotePreferred: boolean;
  yearsExperience: number;
  expectedSalaryMin: number | null;
  expectedSalaryMax: number | null;
  workAuthorization?: string;
}

export interface MatchablePrefs {
  jobTypes: string[];
  locations: string[];
  keywords: string[];
  minSalary: number | null;
  maxSalary: number | null;
  minMatchScore: number;
}

export interface MatchResult {
  score: number;
  tier: 'excellent' | 'good' | 'review' | 'reject';
  reasons: string[];
  breakdown: Record<string, number>;
}

function normalizeSkill(s: string): string {
  const t = s.trim().toLowerCase().replace(/[^a-z0-9#.+-]/g, '');
  return t;
}

/** 0..1 — how strongly a job's text signals a given skill. */
function skillSignal(skillTokens: string[], haystackLower: string): number {
  if (skillTokens.length === 0) return 0;
  let hits = 0;
  for (const tok of skillTokens) {
    if (haystackLower.includes(tok)) hits++;
  }
  return hits / skillTokens.length;
}

export function tierForScore(score: number): MatchResult['tier'] {
  if (score >= MATCH_TIERS_THRESHOLD.excellent) return 'excellent';
  if (score >= MATCH_TIERS_THRESHOLD.good) return 'good';
  if (score >= MATCH_TIERS_THRESHOLD.review) return 'review';
  return 'reject';
}

export function scoreJob(
  job: MatchableJob,
  profile: MatchableProfile,
  prefs: MatchablePrefs,
): MatchResult {
  const breakdown: Record<string, number> = {};
  const reasons: string[] = [];

  const titleLower = job.title.toLowerCase();
  const haystack = `${titleLower} ${(job.description ?? '').toLowerCase()} ${(job.requirements ?? [])
    .join(' ')
    .toLowerCase()}`;
  const profileSkills = profile.skills.map(normalizeSkill).filter(Boolean);
  const prefKeywords = explodeKeywords(...prefs.keywords);

  // --- Skills
  const skillTokenSets = profileSkills.map((s) => s.split(/[^a-z0-9#.+-]+/).filter(Boolean));
  const skillSignals = skillTokenSets.map((toks) => skillSignal(toks, haystack));
  const skillScore = skillSignals.length === 0 ? 0.5 : skillSignals.reduce((a, b) => a + b, 0) / skillSignals.length;
  breakdown.skills = round2(skillScore);

  // --- Title match (skills/keywords in title carry more weight)
  const titleTokens = explodeKeywords(job.title);
  const userTitleTokens = new Set([...prefKeywords, ...profileSkills]);
  const titleHits = titleTokens.filter((t) => userTitleTokens.has(t)).length;
  const titleScore = titleTokens.length === 0 ? 0.5 : titleHits / titleTokens.length;
  breakdown.title = round2(titleScore);

  // --- Experience
  const expScore =
    jobLooksSenior(job)
      ? clamp01(profile.yearsExperience / 5)
      : profile.yearsExperience >= 1
        ? 0.85
        : 0.55;
  breakdown.experience = round2(expScore);

  // --- Location
  const locScore = locationScore(job, profile, prefs);
  breakdown.location = round2(locScore);

  // --- Salary
  const salScore = salaryScore(job, profile, prefs);
  breakdown.salary = round2(salScore);

  // --- Employment type
  const typeScore = typeScore_(job, prefs);
  breakdown.type = round2(typeScore);

  // --- Keywords (preference keywords, bonus)
  const kwScore =
    prefKeywords.length === 0
      ? 0.7
      : prefKeywords.filter((k) => haystack.includes(k)).length / prefKeywords.length;
  breakdown.keywords = round2(kwScore);

  const weights: Record<string, number> = {
    skills: 0.3,
    title: 0.2,
    experience: 0.12,
    location: 0.15,
    salary: 0.1,
    type: 0.08,
    keywords: 0.05,
  };

  let score = 0;
  for (const [k, w] of Object.entries(weights)) {
    score += (breakdown[k] ?? 0) * w;
  }
  score = Math.round(score * 100);

  // --- Reasons (top contributors / red flags)
  const low: string[] = [];
  for (const k of ['skills', 'title', 'location', 'salary'] as const) {
    if ((breakdown[k] ?? 0) < 0.3) low.push(k);
  }
  if (breakdown.skills >= 0.6) reasons.push(`Skill match strong (${Math.round(breakdown.skills * 100)}%)`);
  if (breakdown.title >= 0.6 && breakdown.title > breakdown.skills) reasons.push('Title matches your profile');
  if (locScore >= 0.8) reasons.push(locationReason(job, profile));
  if (salScore >= 0.8) reasons.push('Salary within range');
  if (score < prefs.minMatchScore) reasons.push('Below minimum match score');

  const tier = tierForScore(score);
  return { score, tier, reasons, breakdown };
}

function jobLooksSenior(job: MatchableJob): boolean {
  const t = `${job.title} ${job.description ?? ''}`.toLowerCase();
  return /\b(senior|lead|principal|staff|sr\.?|head|manager)\b/.test(t);
}

function locationScore(job: MatchableJob, profile: MatchableProfile, prefs: MatchablePrefs): number {
  const loc = (job.location ?? '').trim().toLowerCase();
  if (!loc) return 0.6; // unknown location → neutral
  const isRemote = /remote|wfh|anywhere|hybrid/.test(loc);
  if (isRemote) {
    if (profile.remotePreferred) return 1;
    return 0.7;
  }
  const wantLocations = [...profile.locations, ...prefs.locations].map((l) => l.toLowerCase()).filter(Boolean);
  if (wantLocations.length === 0) return 0.6;
  const hit = wantLocations.some((l) => loc.includes(l));
  return hit ? 1 : 0.1;
}

function locationReason(job: MatchableJob, profile: MatchableProfile): string {
  const loc = (job.location ?? '').toLowerCase();
  if (/remote|wfh|anywhere/.test(loc)) return profile.remotePreferred ? 'Remote matches preference' : 'Remote-friendly';
  return `Location matches (${job.location})`;
}

function salaryNumber(s: string): number | null {
  const m = s.replace(/[\s,$Rp]/g, '').match(/(\d{2,})/);
  return m ? parseInt(m[1], 10) : null;
}

function parseSalary(job: MatchableJob): { min: number | null; max: number | null; has: boolean } {
  const min = job.salaryMin ?? (job.salaryText ? salaryNumber(job.salaryText) : null);
  const max = job.salaryMax ?? min;
  return { min, max, has: min !== null && max !== null };
}

function normalizeCurrency(salary: number, currency: string): number {
  if (currency === 'IDR') return salary / 1000; // scale Indonesian salaries down
  return salary;
}

function salaryScore(job: MatchableJob, profile: MatchableProfile, prefs: MatchablePrefs): number {
  const s = parseSalary(job);
  if (!s.has) return 0.65; // unknown salary → neutral
  const jMin = normalizeCurrency(s.min ?? 0, 'USD');
  const jMax = normalizeCurrency(s.max ?? 0, 'USD');
  const expMin = normalizeCurrency(profile.expectedSalaryMin ?? 0, 'USD');
  const expMax = normalizeCurrency(profile.expectedSalaryMax ?? Infinity, 'USD');
  const pMin = normalizeCurrency(prefs.minSalary ?? 0, 'USD');
  const pMax = normalizeCurrency(prefs.maxSalary ?? Infinity, 'USD');
  const min = Math.max(expMin, pMin);
  const max = Math.min(expMax, pMax);
  if (min === 0 && max === Infinity) return 0.7;
  if (jMin > max) return 0.1; // above ceiling
  if (jMax < min) return 0.2; // below floor
  return 0.9;
}

function typeScore_(job: MatchableJob, prefs: MatchablePrefs): number {
  const t = (job.employmentType ?? '').toLowerCase();
  if (!t) return 0.7;
  if (prefs.jobTypes.length === 0) return 0.8;
  const hit = prefs.jobTypes.some((x) => t.includes(x.toLowerCase()));
  return hit ? 1 : 0.35;
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

export interface LlmJudge {
  adjust(job: MatchableJob, profile: MatchableProfile, prefs: MatchablePrefs, base: MatchResult): Promise<MatchResult>;
}