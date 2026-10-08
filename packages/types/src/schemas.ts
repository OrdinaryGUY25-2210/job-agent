import { z } from 'zod';
import {
  AGENT_PLATFORMS,
  AGENT_STATES,
  AGENT_TASK_STATUSES,
  AGENT_TASK_TYPES,
  ANSWER_SOURCES,
  APPLICATION_STATUSES,
  DOCUMENT_KINDS,
  EXPORT_FORMATS,
  MATCH_STATUSES,
  MATCH_TIERS,
} from './enums.js';

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export const registerInput = z.object({
  email: z.string().trim().regex(emailPattern, 'invalid email'),
  password: z.string().min(8, 'min 8 characters').max(200),
  name: z.string().trim().min(1).max(120),
});
export type RegisterInput = z.infer<typeof registerInput>;

export const loginInput = z.object({
  email: z.string().trim().regex(emailPattern, 'invalid email'),
  password: z.string().min(1),
});
export type LoginInput = z.infer<typeof loginInput>;

export const profileInput = z.object({
  headline: z.string().max(200).default(''),
  summary: z.string().max(4000).default(''),
  yearsExperience: z.number().int().min(0).max(60).default(0),
  skills: z.array(z.string().trim().min(1).max(80)).max(100).default([]),
  locations: z.array(z.string().trim().min(1).max(120)).max(50).default([]),
  workAuthorization: z.string().max(120).default(''),
  remotePreferred: z.boolean().default(false),
  currency: z.string().length(3).default('USD'),
  expectedSalaryMin: z.number().int().min(0).nullable().default(null),
  expectedSalaryMax: z.number().int().min(0).nullable().default(null),
  links: z.array(z.object({ label: z.string().max(60), url: z.string().max(500) })).max(20).default([]),
});
export type ProfileInput = z.infer<typeof profileInput>;

export const preferencesInput = z.object({
  portals: z.array(z.string().trim().max(80)).max(30).default([]),
  jobTypes: z.array(z.string().trim().max(60)).max(30).default([]),
  locations: z.array(z.string().trim().max(120)).max(50).default([]),
  keywords: z.array(z.string().trim().max(80)).max(100).default([]),
  minSalary: z.number().int().min(0).nullable().default(null),
  maxSalary: z.number().int().min(0).nullable().default(null),
  minMatchScore: z.number().int().min(0).max(100).default(60),
  requireApproval: z.boolean().default(true),
  autoDiscover: z.boolean().default(false),
});
export type PreferencesInput = z.infer<typeof preferencesInput>;

export const decideInput = z.object({
  jobIds: z.array(z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, 'invalid uuid')).min(1).max(200),
  decision: z.enum(['approve', 'reject']),
});
export type DecideInput = z.infer<typeof decideInput>;

export const applyInput = z.object({
  jobIds: z.array(z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, 'invalid uuid')).min(1).max(200),
});
export type ApplyInput = z.infer<typeof applyInput>;

export const answerInput = z.object({
  question: z.string().trim().min(2).max(1000),
  answer: z.string().trim().min(1).max(4000),
  confidence: z.number().int().min(0).max(100).default(100),
  source: z.enum(ANSWER_SOURCES).default('user'),
  context: z.string().max(300).default(''),
});
export type AnswerInput = z.infer<typeof answerInput>;

export const discoverInput = z.object({
  portals: z.array(z.string().trim().max(80)).max(20).default([]),
  query: z.string().max(200).default(''),
});
export type DiscoverInput = z.infer<typeof discoverInput>;

export const discoveredJobSchema = z.object({
  externalJobId: z.string().max(200).nullable().default(null),
  portal: z.string().trim().max(80),
  jobUrl: z.string().trim().max(1000),
  title: z.string().trim().min(1).max(300),
  company: z.string().trim().max(300).default(''),
  location: z.string().trim().max(300).default(''),
  salaryText: z.string().max(200).default(''),
  salaryMin: z.number().int().min(0).nullable().default(null),
  salaryMax: z.number().int().min(0).nullable().default(null),
  description: z.string().max(20000).default(''),
  requirements: z.array(z.string().max(300)).max(100).default([]),
  employmentType: z.string().max(80).default(''),
  postedAt: z.iso.datetime({ offset: true }).nullable().default(null),
  raw: z.unknown().default(null),
});
export type DiscoveredJob = z.infer<typeof discoveredJobSchema>;

export const ingestJobsInput = z.object({
  tasksId: z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, 'invalid uuid').nullable().default(null),
  jobs: z.array(discoveredJobSchema).min(1).max(500),
});
export type IngestJobsInput = z.infer<typeof ingestJobsInput>;

export const taskReportInput = z.object({
  status: z.enum(AGENT_TASK_STATUSES),
  state: z.enum(AGENT_STATES).optional(),
  error: z.string().max(2000).nullable().default(null),
  stopReason: z.string().max(80).nullable().default(null),
  applicationId: z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, 'invalid uuid').nullable().default(null),
  result: z.unknown().default(null),
});
export type TaskReportInput = z.infer<typeof taskReportInput>;

export const questionAnsweredInput = z.object({
  applicationId: z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, 'invalid uuid'),
  question: z.string().trim().min(2).max(1000),
  answer: z.string().trim().min(1).max(4000),
  source: z.enum(ANSWER_SOURCES).default('user'),
  confidence: z.number().int().min(0).max(100).default(100),
});
export type QuestionAnsweredInput = z.infer<typeof questionAnsweredInput>;

export const policyInput = z.object({
  allowedDomains: z.array(z.string().trim().max(120)).max(100).default([]),
  allowedApps: z.array(z.string().trim().max(160)).max(100).default([]),
  maxConcurrency: z.number().int().min(1).max(5).default(1),
  stopOnCaptcha: z.boolean().default(true),
  paused: z.boolean().default(false),
  pauseReason: z.string().max(300).default(''),
});
export type PolicyInput = z.infer<typeof policyInput>;

export const exportQuery = z.object({
  format: z.enum(EXPORT_FORMATS).default('csv'),
  from: z.string().max(40).optional(),
  to: z.string().max(40).optional(),
});

export const applicationStatusInput = z.object({
  status: z.enum(APPLICATION_STATUSES),
  notes: z.string().max(4000).default(''),
});

export const documentKindSchema = z.enum(DOCUMENT_KINDS);

export interface User {
  id: string;
  email: string;
  name: string;
  role: string;
  createdAt: string;
}

export interface Profile {
  id: string;
  userId: string;
  headline: string;
  summary: string;
  yearsExperience: number;
  skills: string[];
  locations: string[];
  workAuthorization: string;
  remotePreferred: boolean;
  currency: string;
  expectedSalaryMin: number | null;
  expectedSalaryMax: number | null;
  links: { label: string; url: string }[];
  defaultCvId: string | null;
}

export interface JobPreferences {
  id: string;
  userId: string;
  portals: string[];
  jobTypes: string[];
  locations: string[];
  keywords: string[];
  minSalary: number | null;
  maxSalary: number | null;
  minMatchScore: number;
  requireApproval: boolean;
  autoDiscover: boolean;
}

export interface Job {
  id: string;
  externalJobId: string | null;
  portal: string;
  jobUrl: string;
  title: string;
  company: string;
  location: string;
  salaryText: string;
  salaryMin: number | null;
  salaryMax: number | null;
  description: string;
  requirements: string[];
  employmentType: string;
  postedAt: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
}

export interface JobMatch {
  id: string;
  jobId: string;
  userId: string;
  score: number;
  tier: (typeof MATCH_TIERS)[number];
  reasons: string[];
  breakdown: Record<string, number>;
  status: (typeof MATCH_STATUSES)[number];
  decidedAt: string | null;
  createdAt: string;
}

export interface JobWithMatch extends Job {
  match: JobMatch | null;
}

export interface Application {
  id: string;
  userId: string;
  jobId: string | null;
  externalJobId: string | null;
  companyName: string;
  position: string;
  portal: string;
  jobUrl: string;
  location: string;
  salary: string;
  matchScore: number | null;
  cvUsed: string | null;
  status: (typeof APPLICATION_STATUSES)[number];
  source: string;
  applicationHash: string;
  appliedAt: string | null;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface AnswerMemory {
  id: string;
  userId: string;
  question: string;
  normalizedQuestion: string;
  answer: string;
  source: (typeof ANSWER_SOURCES)[number];
  confidence: number;
  usageCount: number;
  updatedAt: string;
}

export interface AgentTask {
  id: string;
  userId: string;
  sessionId: string | null;
  type: (typeof AGENT_TASK_TYPES)[number];
  payload: Record<string, unknown>;
  status: (typeof AGENT_TASK_STATUSES)[number];
  attempts: number;
  error: string | null;
  stopReason: string | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
}

export interface AgentSession {
  id: string;
  userId: string;
  platform: (typeof AGENT_PLATFORMS)[number];
  state: (typeof AGENT_STATES)[number];
  version: string;
  startedAt: string;
  lastSeenAt: string;
}

export interface ApplicationEvent {
  id: string;
  applicationId: string | null;
  userId: string;
  type: string;
  payload: Record<string, unknown> | null;
  createdAt: string;
}

export interface DocumentRecord {
  id: string;
  userId: string;
  kind: (typeof DOCUMENT_KINDS)[number];
  filename: string;
  mimeType: string;
  sizeBytes: number;
  isDefault: boolean;
  createdAt: string;
}

export interface AgentPolicy {
  allowedDomains: string[];
  allowedApps: string[];
  maxConcurrency: number;
  stopOnCaptcha: boolean;
  paused: boolean;
  pauseReason: string;
}
