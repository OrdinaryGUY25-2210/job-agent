'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { tierTone, fmtDate } from '@/lib/format';
import { Badge, Button, Card, Empty, Field, Input, Spinner } from '@/components/ui';
import type { JobWithMatch } from '@jobagent/types';

export default function JobsPage() {
  const [rows, setRows] = useState<JobWithMatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [minScore, setMinScore] = useState('0');
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set('limit', '100');
      const ms = Number(minScore);
      if (ms > 0) params.set('minScore', String(ms));
      if (search) params.set('q', search);
      const res = await api<{ rows: JobWithMatch[]; total: number }>(`/jobs?${params.toString()}`);
      setRows(res.rows);
    } catch {
      setError('Failed to load jobs');
    } finally {
      setLoading(false);
    }
  }, [minScore, search]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-semibold">Jobs</h1>
        <div className="flex items-center gap-2">
          <Field label="Min score">
            <Input
              type="number"
              min={0}
              max={100}
              value={minScore}
              onChange={(e) => setMinScore(e.target.value)}
              className="w-28"
            />
          </Field>
          <Field label="Search">
            <Input
              value={q}
              placeholder="title / company"
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') setSearch(q.trim());
              }}
              className="w-56"
            />
          </Field>
          <Button variant="secondary" onClick={() => setSearch(q.trim())}>
            Apply
          </Button>
          <Button onClick={() => void load()}>{loading ? <Spinner className="h-4 w-4" /> : 'Refresh'}</Button>
        </div>
      </div>

      {error ? <p className="text-sm text-rose-400">{error}</p> : null}
      {!loading && rows.length === 0 ? <Card><Empty message="No jobs yet. Run discovery from the Agent page or ingest jobs via the API." /></Card> : null}

      <Card className="overflow-hidden p-0">
        <table className="w-full text-sm">
          <thead className="bg-slate-950/40 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Score</th>
              <th className="px-4 py-3">Position</th>
              <th className="px-4 py-3">Company</th>
              <th className="px-4 py-3">Portal</th>
              <th className="px-4 py-3">Location</th>
              <th className="px-4 py-3">Salary</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Seen</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {rows.map((job) => (
              <tr key={job.id} className="hover:bg-slate-800/40">
                <td className="px-4 py-2.5">
                  <Badge className={tierTone(job.match?.tier)}>{job.match?.score ?? '—'}</Badge>
                </td>
                <td className="px-4 py-2.5 text-slate-100">{job.title}</td>
                <td className="px-4 py-2.5">{job.company || '—'}</td>
                <td className="px-4 py-2.5">{job.portal}</td>
                <td className="px-4 py-2.5">{job.location || '—'}</td>
                <td className="px-4 py-2.5">{job.salaryText || (job.salaryMin ?? job.salaryMax ?? '—')}</td>
                <td className="px-4 py-2.5">
                  <Badge className={tierTone(job.match?.tier)}>{job.match?.status ?? '—'}</Badge>
                </td>
                <td className="px-4 py-2.5 text-xs text-slate-500">{fmtDate(job.lastSeenAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}