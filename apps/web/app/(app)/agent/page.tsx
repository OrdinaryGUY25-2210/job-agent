'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { fmtDate } from '@/lib/format';
import { Badge, Button, Card, Empty, Field, Input, Textarea } from '@/components/ui';
import type { AnswerMemory, ApplicationEvent } from '@jobagent/types';

interface Overview {
  connectedRunners: number;
  sessions: { id: string; platform: string; state: string; version: string; lastSeenAt: string }[];
  tasks: { queued: number; active: number };
  applicationCounters: Record<string, number>;
  policies: { allowedDomains: string[]; maxConcurrency: number; paused: boolean } | null;
  recentEvents: ApplicationEvent[];
}

export default function AgentPage() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [answers, setAnswers] = useState<AnswerMemory[]>([]);
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [portal, setPortal] = useState('');
  const [query, setQuery] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [o, a] = await Promise.allSettled([
      api<Overview>('/agent/overview'),
      api<{ answers: AnswerMemory[] }>('/answers'),
    ]);
    if (o.status === 'fulfilled') setOverview(o.value);
    if (a.status === 'fulfilled') setAnswers(a.value.answers);
  }, []);

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), 5000);
    return () => clearInterval(timer);
  }, [load]);

  async function runDiscover() {
    setMessage(null);
    try {
      const res = await api<{ task: { id: string } }>('/agent/discover', {
        method: 'POST',
        body: JSON.stringify({ portals: portal ? [portal] : [], query }),
      });
      setMessage(`Discovery task queued (${res.task.id}). Start the laptop runner to execute it.`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Failed to queue discovery');
    }
  }

  async function saveAnswer() {
    if (!question.trim() || !answer.trim()) return;
    setMessage(null);
    try {
      await api('/answers', { method: 'POST', body: JSON.stringify({ question, answer, confidence: 100, source: 'user' }) });
      setQuestion('');
      setAnswer('');
      const a = await api<{ answers: AnswerMemory[] }>('/answers');
      setAnswers(a.answers);
      setMessage('Answer saved to memory.');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Failed to save answer');
    }
  }

  async function removeAnswer(id: string) {
    await api(`/answers/${id}`, { method: 'DELETE' });
    setAnswers((prev) => prev.filter((x) => x.id !== id));
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Agent</h1>
        <div className="flex items-center gap-3">
          <Badge>{overview?.connectedRunners ? 'Agent Online' : 'Agent Offline'}</Badge>
          <Badge className={overview?.tasks.queued ? 'bg-amber-500/15 text-amber-300' : undefined}>
            {overview?.tasks.queued ?? 0} queued · {overview?.tasks.active ?? 0} active
          </Badge>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="mb-3 text-sm font-medium">Run job discovery</h2>
          <div className="space-y-3">
            <Field label="Portal (optional)">
              <Input value={portal} placeholder="linkedin.com" onChange={(e) => setPortal(e.target.value)} />
            </Field>
            <Field label="Search query">
              <Input value={query} placeholder="UI/UX Designer" onChange={(e) => setQuery(e.target.value)} />
            </Field>
            <Button onClick={() => void runDiscover()}>Queue discovery</Button>
            {message ? <p className="text-xs text-slate-300">{message}</p> : null}
          </div>
        </Card>

        <Card>
          <h2 className="mb-3 text-sm font-medium">Safety policy</h2>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-slate-400">Allowed domains</dt>
              <dd className="max-w-[60%] truncate text-right text-slate-200">
                {overview?.policies?.allowedDomains.join(', ') ?? '—'}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-400">Max concurrency</dt>
              <dd className="text-slate-200">{overview?.policies?.maxConcurrency ?? 1}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-400">Paused</dt>
              <dd className="text-slate-200">{overview?.policies?.paused ? 'Yes' : 'No'}</dd>
            </div>
          </dl>
          <p className="mt-3 rounded-lg bg-slate-950/50 p-3 text-xs leading-relaxed text-slate-500">
            The agent never navigates outside the allowlist, never fills passwords, and stops on CAPTCHA — you complete those manually and resume.
          </p>
        </Card>
      </div>

      <Card>
        <h2 className="mb-3 text-sm font-medium">Live events</h2>
        {overview && overview.recentEvents.length === 0 ? (
          <Empty message="No events yet." />
        ) : (
          <ul className="max-h-72 space-y-1 overflow-y-auto text-sm">
            {(overview?.recentEvents ?? []).map((e) => (
              <li key={e.id} className="flex items-center justify-between gap-3 rounded px-2 py-1 hover:bg-slate-800/40">
                <span className="text-slate-200">{e.type}</span>
                <span className="shrink-0 text-xs text-slate-500">{fmtDate(e.createdAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <h2 className="mb-3 text-sm font-medium">Answer memory</h2>
        <div className="mb-4 grid gap-3 md:grid-cols-[1fr_1fr_auto]">
          <Input placeholder="Question (e.g. Are you legally authorized to work in Indonesia?)" value={question} onChange={(e) => setQuestion(e.target.value)} />
          <Textarea placeholder="Answer" value={answer} onChange={(e) => setAnswer(e.target.value)} className="min-h-10" />
          <Button onClick={() => void saveAnswer()}>Save</Button>
        </div>
        {answers.length === 0 ? (
          <Empty message="No saved answers. Teach the agent once and it will reuse the answer on similar questions." />
        ) : (
          <ul className="space-y-2">
            {answers.map((m) => (
              <li key={m.id} className="flex items-start justify-between gap-4 rounded-lg border border-slate-800 p-3">
                <div className="min-w-0">
                  <p className="text-sm text-slate-200">{m.question}</p>
                  <p className="mt-0.5 text-sm text-slate-400">{m.answer}</p>
                  <p className="mt-1 text-xs text-slate-600">
                    used {m.usageCount}× · confidence {m.confidence}%
                  </p>
                </div>
                <button onClick={() => void removeAnswer(m.id)} className="shrink-0 rounded px-2 py-1 text-xs text-rose-400 hover:bg-rose-500/10">
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}