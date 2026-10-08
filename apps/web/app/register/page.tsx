'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { Button, Card, Field, Input } from '@/components/ui';

export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await api('/auth/register', { method: 'POST', body: JSON.stringify({ name, email, password }) });
      router.push('/dashboard');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Registration failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <Card className="w-full max-w-sm">
        <h1 className="mb-1 text-xl font-semibold">Create account</h1>
        <p className="mb-6 text-sm text-slate-400">Set up the agent that applies for you</p>
        <form onSubmit={submit} className="space-y-4">
          <Field label="Name">
            <Input required value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
          </Field>
          <Field label="Email">
            <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
          </Field>
          <Field label="Password" hint="At least 8 characters">
            <Input type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
          </Field>
          {error ? <p className="text-sm text-rose-400">{error}</p> : null}
          <Button type="submit" loading={loading} className="w-full">
            Register
          </Button>
        </form>
        <p className="mt-4 text-sm text-slate-400">
          Already registered?{' '}
          <Link href="/login" className="text-indigo-400 hover:underline">
            Sign in
          </Link>
        </p>
      </Card>
    </main>
  );
}