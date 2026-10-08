'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function Home() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/dashboard');
  }, [router]);
  return (
    <main className="flex h-screen items-center justify-center">
      <p className="text-sm text-slate-500">Loading…</p>
    </main>
  );
}