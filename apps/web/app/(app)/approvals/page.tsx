'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { tierTone, fmtDate } from '@/lib/format';
import { Badge, Button, Card, Empty, Spinner } from '@/components/ui';
import type { Job, JobMatch } from '@jobagent/types';

interface PendingRow {
  match: JobMatch;
  job: Job;
}

export default function ApprovalsPage() {
  const [rows, setRows] = useState<PendingRow[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [approvedIds, setApprovedIds] = useState<string[]>([]);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api<{ rows: PendingRow[] }>('/approvals');
      setRows(res.rows);
      setSelected(new Set());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function decide(decision: 'approve' | 'reject') {
    if (selected.size === 0) return;
    setBusy(true);
    setMessage(null);
    try {
      const res = await api<{ decided: number; applicationsCreated: number }>('/approvals/decide', {
        method: 'POST',
        body: JSON.stringify({ jobIds: Array.from(selected), decision }),
      });
      if (decision === 'approve') setApprovedIds((prev) => [...prev, ...Array.from(selected)]);
      setMessage(`Decision applied to ${res.decided} job${res.decided === 1 ? '' : 's'}.`);
      await load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Failed');
    } finally {
      setBusy(false);
    }
  }

  async function applyAll() {
    setBusy(true);
    setMessage(null);
    try {
      const res = await api<{ tasksCreated: number }>('/approvals/apply', {
        method: 'POST',
        body: JSON.stringify({ jobIds: approvedIds }),
      });
      setMessage(`${res.tasksCreated} application task${res.tasksCreated === 1 ? '' : 's'} queued. Start the runner to execute.`);
      setApprovedIds([]);
      await load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-semibold">Application Approvals</h1>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={() => void load()}>
            Refresh
          </Button>
          <Button variant="danger" onClick={() => void decide('reject')} disabled={selected.size === 0 || busy}>
            Reject selected ({selected.size})
          </Button>
          <Button onClick={() => void decide('approve')} disabled={selected.size === 0 || busy}>
            Approve selected ({selected.size})
          </Button>
        </div>
      </div>

      {approvedIds.length > 0 ? (
        <Card className="flex items-center justify-between border-indigo-500/40 bg-indigo-500/10">
          <p className="text-sm text-indigo-200">{approvedIds.length} approved job{approvedIds.length === 1 ? '' : 's'} ready to apply.</p>
          <Button onClick={() => void applyAll()} disabled={busy}>
            APPLY ALL SELECTED
          </Button>
        </Card>
      ) : null}

      {message ? <p className="text-sm text-slate-300">{message}</p> : null}
      {loading ? (
        <div className="flex h-32 items-center justify-center">
          <Spinner className="h-5 w-5 text-slate-400" />
        </div>
      ) : rows.length === 0 ? (
        <Card>
          <Empty message="No jobs waiting for your decision." />
        </Card>
      ) : (
        <Card className="overflow-hidden p-0">
          <table className="w-full text-sm">
            <thead className="bg-slate-950/40 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="w-10 px-4 py-3"></th>
                <th className="px-4 py-3">Match</th>
                <th className="px-4 py-3">Position</th>
                <th className="px-4 py-3">Company</th>
                <th className="px-4 py-3">Portal</th>
                <th className="px-4 py-3">Location</th>
                <th className="px-4 py-3">Salary</th>
                <th className="px-4 py-3">Detected</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {rows.map(({ match, job }) => (
                <tr key={match.id} className="hover:bg-slate-800/40">
                  <td className="px-4 py-2.5">
                    <input
                      type="checkbox"
                      checked={selected.has(job.id)}
                      onChange={() => toggle(job.id)}
                      className="h-4 w-4 accent-indigo-500"
                    />
                  </td>
                  <td className="px-4 py-2.5">
                    <Badge className={tierTone(match.tier)}>{match.score}%</Badge>
                  </td>
                  <td className="px-4 py-2.5 text-slate-100">{job.title}</td>
                  <td className="px-4 py-2.5">{job.company || '—'}</td>
                  <td className="px-4 py-2.5">{job.portal}</td>
                  <td className="px-4 py-2.5">{job.location || '—'}</td>
                  <td className="px-4 py-2.5">{job.salaryText || (job.salaryMin ?? job.salaryMax ?? '—')}</td>
                  <td className="px-4 py-2.5 text-xs text-slate-500">{fmtDate(match.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}