export const APPLICATION_STATUSES = [
  'discovered',
  'matched',
  'approved',
  'applying',
  'applied',
  'screening',
  'interview',
  'offer',
  'rejected',
  'withdrawn',
  'expired',
  'failed',
  'needs_review',
] as const;
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

export const MATCH_TIERS = ['excellent', 'good', 'review', 'reject'] as const;
export type MatchTier = (typeof MATCH_TIERS)[number];

export const MATCH_STATUSES = ['pending', 'approved', 'rejected'] as const;
export type MatchStatus = (typeof MATCH_STATUSES)[number];

export const AGENT_STATES = [
  'offline',
  'connecting',
  'online',
  'idle',
  'discovering',
  'matching',
  'waiting_approval',
  'applying',
  'submitted',
  'error',
  'needs_review',
] as const;
export type AgentState = (typeof AGENT_STATES)[number];

export const AGENT_TASK_TYPES = ['discover', 'apply'] as const;
export type AgentTaskType = (typeof AGENT_TASK_TYPES)[number];

export const AGENT_TASK_STATUSES = [
  'queued',
  'claimed',
  'running',
  'completed',
  'failed',
  'needs_review',
  'cancelled',
] as const;
export type AgentTaskStatus = (typeof AGENT_TASK_STATUSES)[number];

export const AGENT_PLATFORMS = ['laptop', 'android'] as const;
export type AgentPlatform = (typeof AGENT_PLATFORMS)[number];

export const DOCUMENT_KINDS = ['cv', 'cover_letter', 'other'] as const;
export type DocumentKind = (typeof DOCUMENT_KINDS)[number];

export const EXPORT_FORMATS = ['csv', 'json', 'xlsx'] as const;
export type ExportFormat = (typeof EXPORT_FORMATS)[number];

export const ANSWER_SOURCES = ['user', 'profile', 'ai'] as const;
export type AnswerSource = (typeof ANSWER_SOURCES)[number];

export const STOP_REASONS = [
  'captcha',
  'rate_limited',
  'account_warning',
  'unexpected_page',
  'domain_not_allowed',
  'unknown_question',
  'no_apply_button',
  'form_not_detected',
] as const;
export type StopReason = (typeof STOP_REASONS)[number];

export const MATCH_TIERS_THRESHOLD = {
  excellent: 90,
  good: 75,
  review: 60,
} as const;

export const DEFAULT_ALLOWED_DOMAINS = [
  'linkedin.com',
  'jobstreet.co.id',
  'glints.com',
  'indeed.com',
] as const;
