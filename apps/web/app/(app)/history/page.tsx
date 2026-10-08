'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { fmtDate, statusTone } from '@/lib/format';
import { Badge, Button, Card, Empty, Spinner } from '@/components/ui';
import type { Application } from '@jobagent/types';

export default function HistoryPage() {
  const [rows, setRows] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('');

  const load = useCallback(async (st: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('limit', '200');
      if (st) params.set('status', st);
      const res = await api<{ rows: Application[]; total: number }>(`/applications?${params.toString()}`);
      setRows(res.rows);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(status);
  }, [load, status]);

  const FILTERS = ['', 'applied', 'applying', 'screening', 'interview', 'offer', 'rejected', 'needs_review'];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-semibold">Application History</h1>
        <div className="flex items-center gap-2">
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-indigo-500 focus:outline-none"
          >
            {FILTERS.map((f) => (
              <option key={f} value={f}>
                {f === '' ? 'All statuses' : f}
              </option>
            ))}
          </select>
          <a href="/api/export/applications?format=csv">
            <Button variant="secondary">CSV</Button>
          </a>
          <a href="/api/export/applications?format=json">
            <Button variant="secondary">JSON</Button>
          </a>
          <a href="/api/export/applications?format=xlsx">
            <Button variant="secondary">XLSX</Button>
          </a>
        </div>
      </div>

      {loading ? (
        <div className="flex h-32 items-center justify-center">
          <Spinner className="h-5 w-5 text-slate-400" />
        </div>
      ) : rows.length === 0 ? (
        <Card>
          <Empty message="No applications recorded yet." />
        </Card>
      ) : (
        <Card className="overflow-hidden p-0">
          <table className="w-full text-sm">
            <thead className="bg-slate-950/40 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Position</th>
                <th className="px-4 py-3">Company</th>
                <th className="px-4 py-3">Portal</th>
                <th className="px-4 py-3">Match</th>
                <th className="px-4 py-3">CV</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Applied at</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {rows.map((a) => (
                <tr key={a.id} className="hover:bg-slate-800/40">
                  <td className="px-4 py-2.5 text-slate-100">{a.position}</td>
                  <td className="px-4 py-2.5">{a.companyName}</td>
                  <td className="px-4 py-2.5">{a.portal}</td>
                  <td className="px-4 py-2.5">{a.matchScore ?? '—'}</td>
                  <td className="px-4 py-2.5">{a.cvUsed ?? '—'}</td>
                  <td className="px-4 py-2.5">
                    <Badge className={statusTone(a.status)}>{a.status}</Badge>
                  </td>
                  <td className="px-4 py-2.5 text-xs text-slate-500">{fmtDate(a.appliedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}