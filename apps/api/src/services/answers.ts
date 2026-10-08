import { and, desc, eq, sql } from 'drizzle-orm';
import { getDb, schema } from '@jobagent/db';
import { normalizeQuestion } from '@jobagent/shared';
import { matchAnswer } from '@jobagent/ai';
import type { AnswerMemory } from '@jobagent/types';
import { badRequest, notFound } from '../lib/http.js';

const db = () => getDb();

function serialize(m: {
  id: string;
  userId: string;
  question: string;
  normalizedQuestion: string;
  answer: string;
  source: AnswerMemory['source'];
  confidence: number;
  usageCount: number;
  updatedAt: Date;
}): AnswerMemory {
  return {
    id: m.id,
    userId: m.userId,
    question: m.question,
    normalizedQuestion: m.normalizedQuestion,
    answer: m.answer,
    source: m.source,
    confidence: m.confidence,
    usageCount: m.usageCount,
    updatedAt: m.updatedAt.toISOString(),
  };
}

export async function listAnswers(userId: string): Promise<AnswerMemory[]> {
  const rows = await db()
    .select()
    .from(schema.answerMemory)
    .where(eq(schema.answerMemory.userId, userId))
    .orderBy(desc(schema.answerMemory.updatedAt));
  return rows.map(serialize);
}

export async function upsertAnswer(
  userId: string,
  input: { question: string; answer: string; confidence?: number; source?: AnswerMemory['source']; context?: string },
): Promise<AnswerMemory> {
  const q = input.question.trim();
  const a = input.answer.trim();
  if (q.length < 2) badRequest('Question too short');
  if (a.length < 1) badRequest('Answer empty');

  const normalizedQuestion = normalizeQuestion(q);
  const row = await db()
    .insert(schema.answerMemory)
    .values({
      userId,
      question: q,
      normalizedQuestion,
      answer: a,
      confidence: input.confidence ?? 100,
      source: input.source ?? 'user',
    })
    .onConflictDoUpdate({
      target: [schema.answerMemory.userId, schema.answerMemory.normalizedQuestion],
      set: { answer: a, confidence: input.confidence ?? 100, source: input.source ?? 'user', updatedAt: new Date() },
    })
    .returning();
  return serialize(row[0] ?? notFound('Failed to save answer'));
}

export async function deleteAnswer(userId: string, id: string): Promise<boolean> {
  const removed = await db()
    .delete(schema.answerMemory)
    .where(and(eq(schema.answerMemory.id, id), eq(schema.answerMemory.userId, userId)))
    .returning();
  return removed.length > 0;
}

export async function resolveAnswer(
  userId: string,
  question: string,
): Promise<{ memory: AnswerMemory; method: 'exact' | 'semantic'; confidence: number } | null> {
  if (question.trim().length < 2) badRequest('Question too short');
  const memories = await listAnswers(userId);
  const hit = matchAnswer(memories, question);
  if (!hit) return null;
  const memory = memories.find((m) => m.id === hit.memoryId);
  if (!memory) return null;
  await db()
    .update(schema.answerMemory)
    .set({ usageCount: sql`${schema.answerMemory.usageCount} + 1` })
    .where(eq(schema.answerMemory.id, memory.id));
  return { memory, method: hit.method, confidence: hit.confidence };
}