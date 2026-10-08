import { and, eq } from 'drizzle-orm';
import { getDb, schema } from '@jobagent/db';
import { DEFAULT_ALLOWED_DOMAINS } from '@jobagent/types';
import type { DocumentKind, PreferencesInput, ProfileInput, PolicyInput } from '@jobagent/types';
import { badRequest, notFound } from '../lib/http.js';

const db = () => getDb();

export async function getSettings(userId: string) {
  const profileRow = await db().query.profiles.findFirst({ where: eq(schema.profiles.userId, userId) });
  const prefsRow = await db().query.jobPreferences.findFirst({ where: eq(schema.jobPreferences.userId, userId) });
  const policiesRow = await db().query.agentPolicies.findFirst({ where: eq(schema.agentPolicies.userId, userId) });
  const documents = await db().query.documents.findMany({
    where: eq(schema.documents.userId, userId),
    orderBy: (t, { desc }) => [desc(t.createdAt)],
  });

  let portals = await db().query.jobPortals.findMany({ where: eq(schema.jobPortals.userId, userId) });
  if (portals.length === 0) {
    portals = (
      await db()
        .insert(schema.jobPortals)
        .values(
          Array.from(DEFAULT_ALLOWED_DOMAINS).map((d) => ({ userId, portal: d, label: d, enabled: true, baseUrl: `https://${d}` })),
        )
        .returning()
    );
  }

  return {
    profile: profileRow
      ? serializeProfile(profileRow)
      : null,
    preferences: prefsRow ?? null,
    policies: policiesRow ?? null,
    portals,
    documents: documents.map((d) => ({
      id: d.id,
      kind: d.kind,
      filename: d.filename,
      mimeType: d.mimeType,
      sizeBytes: d.sizeBytes,
      isDefault: d.isDefault,
      createdAt: d.createdAt.toISOString(),
    })),
  };
}

function serializeProfile(p: {
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
}) {
  return {
    id: p.id,
    userId: p.userId,
    headline: p.headline,
    summary: p.summary,
    yearsExperience: p.yearsExperience,
    skills: p.skills,
    locations: p.locations,
    workAuthorization: p.workAuthorization,
    remotePreferred: p.remotePreferred,
    currency: p.currency,
    expectedSalaryMin: p.expectedSalaryMin,
    expectedSalaryMax: p.expectedSalaryMax,
    links: p.links,
    defaultCvId: p.defaultCvId,
  };
}

export async function upsertProfile(userId: string, input: unknown) {
  const parsed = input as ProfileInput;
  if (!parsed || typeof parsed !== 'object') badRequest('Invalid profile payload');
  const row = await db()
    .insert(schema.profiles)
    .values({ userId, ...parsed })
    .onConflictDoUpdate({ target: schema.profiles.userId, set: { ...parsed, updatedAt: new Date() } })
    .returning();
  const p = row[0];
  if (!p) badRequest('Failed to save profile');
  return serializeProfile(p);
}

export async function upsertPreferences(userId: string, input: unknown) {
  const parsed = input as PreferencesInput;
  if (!parsed || typeof parsed !== 'object') badRequest('Invalid preferences payload');
  const row = await db()
    .insert(schema.jobPreferences)
    .values({ userId, ...parsed })
    .onConflictDoUpdate({ target: schema.jobPreferences.userId, set: { ...parsed, updatedAt: new Date() } })
    .returning();
  return row[0] ?? badRequest('Failed to save preferences');
}

export async function getOrCreatePolicies(userId: string) {
  let row = await db().query.agentPolicies.findFirst({ where: eq(schema.agentPolicies.userId, userId) });
  if (!row) {
    const inserted = await db()
      .insert(schema.agentPolicies)
      .values({ userId, allowedDomains: Array.from(DEFAULT_ALLOWED_DOMAINS), allowedApps: [], maxConcurrency: 1, stopOnCaptcha: true, paused: false, pauseReason: '' })
      .onConflictDoNothing()
      .returning();
    row = inserted[0] ?? (await db().query.agentPolicies.findFirst({ where: eq(schema.agentPolicies.userId, userId) }));
  }
  return row;
}

export async function upsertPolicies(userId: string, input: unknown) {
  const parsed = input as PolicyInput;
  if (!parsed || typeof parsed !== 'object') badRequest('Invalid policy payload');
  const row = await db()
    .insert(schema.agentPolicies)
    .values({ userId, ...parsed })
    .onConflictDoUpdate({ target: schema.agentPolicies.userId, set: { ...parsed, updatedAt: new Date() } })
    .returning();
  return row[0] ?? badRequest('Failed to save policy');
}

export async function addDocument(userId: string, doc: { kind: string; filename: string; storageKey: string; mimeType?: string | null; sizeBytes: number }) {
  return (await db().insert(schema.documents).values({ userId, ...doc, kind: doc.kind as DocumentKind }).returning())[0] ?? notFound();
}

export async function removeDocument(userId: string, id: string) {
  const removed = await db().delete(schema.documents).where(and(eq(schema.documents.id, id), eq(schema.documents.userId, userId))).returning();
  return removed[0] ?? null;
}

export async function setDefaultCv(userId: string, docId: string) {
  await db().update(schema.documents).set({ isDefault: false }).where(eq(schema.documents.userId, userId));
  await db().update(schema.documents).set({ isDefault: true }).where(and(eq(schema.documents.id, docId), eq(schema.documents.userId, userId)));
  const cv = await db().query.documents.findFirst({ where: eq(schema.documents.id, docId) });
  if (!cv) {
    await db().update(schema.profiles).set({ defaultCvId: null }).where(eq(schema.profiles.userId, userId));
    return null;
  }
  await db().update(schema.profiles).set({ defaultCvId: docId }).where(eq(schema.profiles.userId, userId));
  return cv;
}