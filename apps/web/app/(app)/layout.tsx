'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { cn } from '@/components/ui';

const NAV = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/jobs', label: 'Jobs' },
  { href: '/approvals', label: 'Approvals' },
  { href: '/history', label: 'History' },
  { href: '/agent', label: 'Agent' },
  { href: '/settings', label: 'Settings' },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    api<{ user: { name: string; email: string } }>('/auth/me')
      .then(() => setReady(true))
      .catch((err) => {
        if (err instanceof ApiError && err.status === 401) {
          router.replace('/login');
        } else {
          setReady(true);
        }
      });
  }, [router]);

  if (!ready) {
    return (
      <main className="flex h-screen items-center justify-center text-sm text-slate-500">Checking session…</main>
    );
  }

  return (
    <div className="flex min-h-screen">
      <aside className="w-56 shrink-0 border-r border-slate-800 bg-slate-950/60 p-4">
        <div className="mb-6 px-2">
          <p className="text-base font-semibold tracking-tight">Job Agent</p>
          <p className="text-xs text-slate-500">Control center</p>
        </div>
        <nav className="space-y-1">
          {NAV.map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'block rounded-lg px-3 py-2 text-sm transition-colors',
                  active ? 'bg-indigo-500/15 text-indigo-300' : 'text-slate-400 hover:bg-slate-800/70 hover:text-slate-200',
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
        <button
          onClick={async () => {
            try {
              await api('/auth/logout', { method: 'POST' });
            } finally {
              router.replace('/login');
            }
          }}
          className="mt-8 block w-full rounded-lg px-3 py-2 text-left text-sm text-slate-500 hover:bg-slate-800/70 hover:text-slate-300"
        >
          Sign out
        </button>
      </aside>
      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}