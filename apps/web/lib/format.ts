import type { MatchTier } from '@jobagent/types';

export function tierTone(tier: MatchTier | null | undefined): string {
  switch (tier) {
    case 'excellent':
      return 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30';
    case 'good':
      return 'bg-sky-500/15 text-sky-300 border-sky-500/30';
    case 'review':
      return 'bg-amber-500/15 text-amber-300 border-amber-500/30';
    case 'reject':
      return 'bg-rose-500/15 text-rose-300 border-rose-500/30';
    default:
      return 'bg-slate-500/15 text-slate-300 border-slate-500/30';
  }
}

export function statusTone(status: string): string {
  const map: Record<string, string> = {
    discovered: 'bg-slate-500/15 text-slate-300 border-slate-500/30',
    matched: 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30',
    approved: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
    applying: 'bg-violet-500/15 text-violet-300 border-violet-500/30',
    applied: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
    screening: 'bg-teal-500/15 text-teal-300 border-teal-500/30',
    interview: 'bg-blue-500/15 text-blue-300 border-blue-500/30',
    offer: 'bg-green-500/15 text-green-300 border-green-500/30',
    rejected: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
    withdrawn: 'bg-slate-500/15 text-slate-300 border-slate-500/30',
    expired: 'bg-slate-500/15 text-slate-300 border-slate-500/30',
    failed: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
    needs_review: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  };
  return map[status] ?? 'bg-slate-500/15 text-slate-300 border-slate-500/30';
}

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}