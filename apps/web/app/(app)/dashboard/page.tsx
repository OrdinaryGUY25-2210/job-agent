'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { fmtDate } from '@/lib/format';
import { Badge, Button, Card, Empty, Spinner } from '@/components/ui';

interface Overview {
  connectedRunners: number;
  sessions: { id: string; platform: string; state: string; version: string; lastSeenAt: string }[];
  tasks: { queued: number; active: number };
  applicationCounters: Record<string, number>;
  recentEvents: { id: string; type: string; payload: Record<string, unknown> | null; createdAt: string }[];
}

export default function DashboardPage() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [approvalCount, setApprovalCount] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    Promise.allSettled([api<Overview>('/agent/overview'), api<{ rows: unknown[] }>('/approvals')]).then(([o, a]) => {
      if (!active) return;
      if (o.status === 'fulfilled') setOverview(o.value);
      else setError('Failed to load overview');
      if (a.status === 'fulfilled') setApprovalCount(a.value.rows.length);
    });
    return () => {
      active = false;
    };
  }, []);

  if (error) return <p className="text-sm text-rose-400">{error}</p>;
  if (!overview) {
    return (
      <div className="flex h-40 items-center justify-center">
        <Spinner className="h-5 w-5 text-slate-400" />
      </div>
    );
  }

  const counters = overview.applicationCounters ?? {};
  const total = Object.values(counters).reduce((a, b) => a + b, 0);
  const applied = counters['applied'] ?? 0;

  const stats = [
    { label: 'Applications', value: total },
    { label: 'Applied', value: applied },
    { label: 'Pending approval', value: approvalCount },
    { label: 'Queued tasks', value: overview.tasks.queued },
    { label: 'Active tasks', value: overview.tasks.active },
    { label: 'Connected runners', value: overview.connectedRunners },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Dashboard</h1>
        <Link href="/approvals">
          <Button variant="secondary">Review approvals</Button>
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
        {stats.map((s) => (
          <Card key={s.label} className="p-4">
            <p className="text-xs text-slate-500">{s.label}</p>
            <p className="mt-1 text-2xl font-semibold">{s.value}</p>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="mb-3 text-sm font-medium">Recent agent activity</h2>
          {overview.recentEvents.length === 0 ? (
            <Empty message="No events yet. Start the laptop runner to see live activity." />
          ) : (
            <ul className="space-y-2">
              {overview.recentEvents.slice(0, 12).map((e) => (
                <li key={e.id} className="flex items-center justify-between gap-3 text-sm">
                  <span className="text-slate-200">{eventLabel(e.type)}</span>
                  <span className="shrink-0 text-xs text-slate-500">{fmtDate(e.createdAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <h2 className="mb-3 text-sm font-medium">Agent sessions</h2>
          {overview.sessions.length === 0 ? (
            <Empty message="No runners connected yet." />
          ) : (
            <ul className="space-y-2">
              {overview.sessions.map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-3 text-sm">
                  <span className="text-slate-200">{s.platform}</span>
                  <Badge>{s.state}</Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

function eventLabel(type: string): string {
  const map: Record<string, string> = {
    job_detected: 'Job detected',
    match_approved: 'Match approved',
    match_rejected: 'Match rejected',
    application_queued: 'Application queued',
    application_submitted: 'Application submitted',
    task_failed: 'Task failed',
    needs_review: 'Needs review',
    status_changed: 'Status changed',
  };
  return map[type] ?? type;
}