import { relations, sql } from 'drizzle-orm';
import {
  index,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
  integer,
  boolean,
} from 'drizzle-orm/pg-core';

export const applicationStatusEnum = pgEnum('application_status', [
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
]);
export const matchTierEnum = pgEnum('match_tier', ['excellent', 'good', 'review', 'reject']);
export const matchStatusEnum = pgEnum('match_status', ['pending', 'approved', 'rejected']);
export const agentStateEnum = pgEnum('agent_state', [
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
]);
export const agentTaskStatusEnum = pgEnum('agent_task_status', [
  'queued',
  'claimed',
  'running',
  'completed',
  'failed',
  'needs_review',
  'cancelled',
]);
export const agentPlatformEnum = pgEnum('agent_platform', ['laptop', 'android']);
export const agentTaskTypeEnum = pgEnum('agent_task_type', ['discover', 'apply']);
export const documentKindEnum = pgEnum('document_kind', ['cv', 'cover_letter', 'other']);
export const answerSourceEnum = pgEnum('answer_source', ['user', 'profile', 'ai']);

const now = () => timestamp('created_at', { withTimezone: true }).defaultNow().notNull();

export const users = pgTable(
  'users',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    email: varchar('email', { length: 255 }).notNull(),
    passwordHash: varchar('password_hash', { length: 255 }).notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    role: varchar('role', { length: 32 }).default('owner').notNull(),
    createdAt: now(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex('users_email_uq').on(t.email)],
);

export const profiles = pgTable(
  'profiles',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    headline: varchar('headline', { length: 200 }).default('').notNull(),
    summary: text('summary').default('').notNull(),
    yearsExperience: integer('years_experience').default(0).notNull(),
    skills: jsonb('skills').$type<string[]>().default(sql`'[]'::jsonb`).notNull(),
    locations: jsonb('locations').$type<string[]>().default(sql`'[]'::jsonb`).notNull(),
    workAuthorization: varchar('work_authorization', { length: 120 }).default('').notNull(),
    remotePreferred: boolean('remote_preferred').default(false).notNull(),
    currency: varchar('currency', { length: 3 }).default('USD').notNull(),
    expectedSalaryMin: integer('expected_salary_min'),
    expectedSalaryMax: integer('expected_salary_max'),
    links: jsonb('links').$type<{ label: string; url: string }[]>().default(sql`'[]'::jsonb`).notNull(),
    defaultCvId: uuid('default_cv_id').references(() => documents.id, { onDelete: 'set null' }),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex('profiles_user_uq').on(t.userId)],
);

export const jobPreferences = pgTable(
  'job_preferences',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    portals: jsonb('portals').$type<string[]>().default(sql`'[]'::jsonb`).notNull(),
    jobTypes: jsonb('job_types').$type<string[]>().default(sql`'[]'::jsonb`).notNull(),
    locations: jsonb('locations').$type<string[]>().default(sql`'[]'::jsonb`).notNull(),
    keywords: jsonb('keywords').$type<string[]>().default(sql`'[]'::jsonb`).notNull(),
    minSalary: integer('min_salary'),
    maxSalary: integer('max_salary'),
    minMatchScore: integer('min_match_score').default(60).notNull(),
    requireApproval: boolean('require_approval').default(true).notNull(),
    autoDiscover: boolean('auto_discover').default(false).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex('job_preferences_user_uq').on(t.userId)],
);

export const jobPortals = pgTable(
  'job_portals',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    portal: varchar('portal', { length: 80 }).notNull(),
    label: varchar('label', { length: 160 }).notNull(),
    enabled: boolean('enabled').default(true).notNull(),
    baseUrl: varchar('base_url', { length: 500 }),
    settings: jsonb('settings').$type<Record<string, unknown>>(),
    lastSyncedAt: timestamp('last_synced_at', { withTimezone: true }),
  },
  (t) => [uniqueIndex('job_portals_user_portal_uq').on(t.userId, t.portal)],
);

export const documents = pgTable(
  'documents',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    kind: documentKindEnum('kind').default('cv').notNull(),
    filename: varchar('filename', { length: 255 }).notNull(),
    storageKey: varchar('storage_key', { length: 500 }).notNull(),
    mimeType: varchar('mime_type', { length: 120 }),
    sizeBytes: integer('size_bytes').default(0).notNull(),
    isDefault: boolean('is_default').default(false).notNull(),
    createdAt: now(),
  },
  (t) => [index('documents_user_idx').on(t.userId)],
);

export const jobs = pgTable(
  'jobs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    externalJobId: varchar('external_job_id', { length: 255 }),
    portal: varchar('portal', { length: 80 }).notNull(),
    jobUrl: varchar('job_url', { length: 1000 }).notNull(),
    normalizedUrl: varchar('normalized_url', { length: 900 }).notNull(),
    title: varchar('title', { length: 300 }).notNull(),
    company: varchar('company', { length: 300 }).default('').notNull(),
    location: varchar('location', { length: 300 }).default('').notNull(),
    salaryText: varchar('salary_text', { length: 200 }).default('').notNull(),
    salaryMin: integer('salary_min'),
    salaryMax: integer('salary_max'),
    description: text('description').default('').notNull(),
    requirements: jsonb('requirements').$type<string[]>().default(sql`'[]'::jsonb`).notNull(),
    employmentType: varchar('employment_type', { length: 80 }).default('').notNull(),
    postedAt: timestamp('posted_at', { withTimezone: true }),
    source: varchar('source', { length: 32 }).default('agent').notNull(),
    raw: jsonb('raw').$type<Record<string, unknown>>(),
    firstSeenAt: now(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('jobs_portal_external_uq').on(t.portal, t.externalJobId),
    uniqueIndex('jobs_portal_url_uq').on(t.portal, t.normalizedUrl),
    index('jobs_last_seen_idx').on(t.lastSeenAt),
  ],
);

export const jobMatches = pgTable(
  'job_matches',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    jobId: uuid('job_id').notNull().references(() => jobs.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    score: integer('score').notNull(),
    tier: matchTierEnum('tier').notNull(),
    reasons: jsonb('reasons').$type<string[]>().default(sql`'[]'::jsonb`).notNull(),
    breakdown: jsonb('breakdown').$type<Record<string, number>>().default(sql`'{}'::jsonb`).notNull(),
    status: matchStatusEnum('status').default('pending').notNull(),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
    createdAt: now(),
  },
  (t) => [
    uniqueIndex('job_matches_user_job_uq').on(t.userId, t.jobId),
    index('job_matches_user_status_idx').on(t.userId, t.status),
  ],
);

export const applications = pgTable(
  'applications',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    jobId: uuid('job_id').references(() => jobs.id, { onDelete: 'set null' }),
    externalJobId: varchar('external_job_id', { length: 255 }),
    companyName: varchar('company_name', { length: 300 }).notNull(),
    position: varchar('position', { length: 300 }).notNull(),
    portal: varchar('portal', { length: 80 }).notNull(),
    jobUrl: varchar('job_url', { length: 1000 }).notNull(),
    location: varchar('location', { length: 300 }).default('').notNull(),
    salary: varchar('salary', { length: 200 }).default('').notNull(),
    matchScore: integer('match_score'),
    cvUsed: varchar('cv_used', { length: 255 }),
    status: applicationStatusEnum('status').default('discovered').notNull(),
    source: varchar('source', { length: 32 }).default('agent').notNull(),
    applicationHash: varchar('application_hash', { length: 400 }).notNull(),
    notes: text('notes').default('').notNull(),
    appliedAt: timestamp('applied_at', { withTimezone: true }),
    createdAt: now(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('applications_user_hash_uq').on(t.userId, t.applicationHash),
    index('applications_user_status_idx').on(t.userId, t.status),
    index('applications_applied_idx').on(t.appliedAt),
  ],
);

export const applicationAnswers = pgTable(
  'application_answers',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    applicationId: uuid('application_id').notNull().references(() => applications.id, { onDelete: 'cascade' }),
    question: varchar('question', { length: 1000 }).notNull(),
    normalizedQuestion: varchar('normalized_question', { length: 1000 }).notNull(),
    answer: text('answer').notNull(),
    source: answerSourceEnum('source').default('user').notNull(),
    confidence: integer('confidence').default(100).notNull(),
    createdAt: now(),
  },
  (t) => [index('application_answers_app_idx').on(t.applicationId)],
);

export const applicationEvents = pgTable(
  'application_events',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    applicationId: uuid('application_id').references(() => applications.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    type: varchar('type', { length: 80 }).notNull(),
    payload: jsonb('payload').$type<Record<string, unknown> | null>(),
    createdAt: now(),
  },
  (t) => [
    index('application_events_user_created_idx').on(t.userId, t.createdAt),
    index('application_events_app_idx').on(t.applicationId),
  ],
);

export const answerMemory = pgTable(
  'answer_memory',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    question: varchar('question', { length: 1000 }).notNull(),
    normalizedQuestion: varchar('normalized_question', { length: 1000 }).notNull(),
    answer: text('answer').notNull(),
    source: answerSourceEnum('source').default('user').notNull(),
    confidence: integer('confidence').default(100).notNull(),
    usageCount: integer('usage_count').default(0).notNull(),
    createdAt: now(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex('answer_memory_user_q_uq').on(t.userId, t.normalizedQuestion)],
);

export const agentSessions = pgTable(
  'agent_sessions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    platform: agentPlatformEnum('platform').default('laptop').notNull(),
    version: varchar('version', { length: 40 }).default('').notNull(),
    state: agentStateEnum('state').default('offline').notNull(),
    userAgent: varchar('user_agent', { length: 500 }),
    startedAt: now(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).defaultNow().notNull(),
    meta: jsonb('meta').$type<Record<string, unknown>>(),
  },
  (t) => [index('agent_sessions_user_idx').on(t.userId)],
);

export const agentTasks = pgTable(
  'agent_tasks',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    sessionId: uuid('session_id').references(() => agentSessions.id, { onDelete: 'set null' }),
    type: agentTaskTypeEnum('type').notNull(),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
    status: agentTaskStatusEnum('status').default('queued').notNull(),
    attempts: integer('attempts').default(0).notNull(),
    priority: integer('priority').default(0).notNull(),
    error: text('error'),
    stopReason: varchar('stop_reason', { length: 80 }),
    claimedAt: timestamp('claimed_at', { withTimezone: true }),
    createdAt: now(),
    startedAt: timestamp('started_at', { withTimezone: true }),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
  },
  (t) => [
    index('agent_tasks_user_status_idx').on(t.userId, t.status),
    index('agent_tasks_queued_idx').on(t.userId, t.status, t.priority),
  ],
);

export const agentPolicies = pgTable(
  'agent_policies',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    allowedDomains: jsonb('allowed_domains').$type<string[]>().default(sql`'[]'::jsonb`).notNull(),
    allowedApps: jsonb('allowed_apps').$type<string[]>().default(sql`'[]'::jsonb`).notNull(),
    maxConcurrency: integer('max_concurrency').default(1).notNull(),
    stopOnCaptcha: boolean('stop_on_captcha').default(true).notNull(),
    paused: boolean('paused').default(false).notNull(),
    pauseReason: varchar('pause_reason', { length: 300 }).default('').notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex('agent_policies_user_uq').on(t.userId)],
);

export const exportJobs = pgTable(
  'export_jobs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    format: varchar('format', { length: 16 }).notNull(),
    rowCount: integer('row_count').default(0).notNull(),
    filters: jsonb('filters').$type<Record<string, unknown>>(),
    fileKey: varchar('file_key', { length: 500 }),
    createdAt: now(),
  },
  (t) => [index('export_jobs_user_idx').on(t.userId)],
);

export const jobMatchesRelations = relations(jobMatches, ({ one }) => ({
  job: one(jobs, { fields: [jobMatches.jobId], references: [jobs.id] }),
}));

export const applicationsRelations = relations(applications, ({ one }) => ({
  job: one(jobs, { fields: [applications.jobId], references: [jobs.id] }),
}));

export const usersRelations = relations(users, ({ many }) => ({
  profiles: many(profiles),
  jobPreferences: many(jobPreferences),
  documents: many(documents),
  applications: many(applications),
}));