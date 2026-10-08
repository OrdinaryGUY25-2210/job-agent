import { normalizeQuestion, tokenOverlap } from '@jobagent/shared';

export interface MemoryAnswer {
  id: string;
  question: string;
  normalizedQuestion: string;
  answer: string;
  confidence: number;
  usageCount: number;
}

export interface AnswerMatch {
  memoryId: string;
  answer: string;
  confidence: number;
  method: 'exact' | 'semantic';
}

/**
 * Look up the best-known answer for a question.
 * Returns null when nothing is close enough — in that case the caller MUST NOT guess.
 * Safety rule: AI never fabricates personal facts; it asks the user instead.
 */
export function matchAnswer(memories: MemoryAnswer[], question: string): AnswerMatch | null {
  if (memories.length === 0) return null;

  const qNorm = normalizeQuestion(question);
  if (qNorm === '') return null;

  const exact = memories.find((m) => m.normalizedQuestion === qNorm);
  if (exact) {
    return {
      memoryId: exact.id,
      answer: exact.answer,
      confidence: Math.min(99, Math.max(90, exact.confidence)),
      method: 'exact',
    };
  }

  let best: { memory: MemoryAnswer; overlap: number } | null = null;
  for (const m of memories) {
    const overlap = tokenOverlap(m.normalizedQuestion, qNorm);
    if (overlap >= 0.62 && (!best || overlap > best.overlap)) {
      best = { memory: m, overlap };
    }
  }
  if (!best) return null;

  const confidence = Math.round(Math.min(90, best.overlap * 100));
  return {
    memoryId: best.memory.id,
    answer: best.memory.answer,
    confidence,
    method: 'semantic',
  };
}

export type { MemoryAnswer as AnswerMemoryRow };