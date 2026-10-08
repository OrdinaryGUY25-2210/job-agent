'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, listFromInput, ApiError } from '@/lib/api';
import { Badge, Button, Card, Field, Input, Textarea } from '@/components/ui';
import type { Profile, JobPreferences } from '@jobagent/types';

interface Settings {
  profile: Profile | null;
  preferences: JobPreferences | null;
  policies: { allowedDomains: string[]; allowedApps: string[]; maxConcurrency: number; stopOnCaptcha: boolean; paused: boolean; pauseReason: string };
  documents: { id: string; kind: string; filename: string; mimeType: string; sizeBytes: number; isDefault: boolean; createdAt: string }[];
}

const DEFAULT_PROFILE: Profile = {
  id: '',
  userId: '',
  headline: '',
  summary: '',
  yearsExperience: 0,
  skills: [],
  locations: [],
  workAuthorization: '',
  remotePreferred: false,
  currency: 'IDR',
  expectedSalaryMin: null,
  expectedSalaryMax: null,
  links: [],
  defaultCvId: null,
};

const DEFAULT_PREFS: JobPreferences = {
  id: '',
  userId: '',
  portals: ['linkedin.com', 'jobstreet.co.id', 'glints.com', 'indeed.com'],
  jobTypes: [],
  locations: [],
  keywords: [],
  minSalary: null,
  maxSalary: null,
  minMatchScore: 60,
  requireApproval: true,
  autoDiscover: false,
};

export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [profile, setProfile] = useState<Profile>(DEFAULT_PROFILE);
  const [prefs, setPrefs] = useState<JobPreferences>(DEFAULT_PREFS);
  const [domains, setDomains] = useState('');
  const [concurrency, setConcurrency] = useState('1');
  const [paused, setPaused] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const load = useCallback(async () => {
    const res = await api<{ settings: Settings }>('/settings');
    setSettings(res.settings);
    if (res.settings.profile) setProfile(res.settings.profile);
    if (res.settings.preferences) setPrefs(res.settings.preferences);
    setDomains((res.settings.policies?.allowedDomains ?? []).join(', '));
    setConcurrency(String(res.settings.policies?.maxConcurrency ?? 1));
    setPaused(res.settings.policies?.paused ?? false);
  }, []);

  useEffect(() => {
    void load().catch(() => setMessage('Failed to load settings'));
  }, [load]);

  async function saveProfile() {
    setMessage(null);
    try {
      await api('/profile', { method: 'PUT', body: JSON.stringify(profile) });
      setMessage('Profile saved.');
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : 'Save failed');
    }
  }

  async function savePreferences() {
    setMessage(null);
    try {
      await api('/preferences', { method: 'PUT', body: JSON.stringify(prefs) });
      setMessage('Preferences saved.');
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : 'Save failed');
    }
  }

  async function savePolicies() {
    setMessage(null);
    try {
      await api('/policies', {
        method: 'PUT',
        body: JSON.stringify({
          allowedDomains: listFromInput(domains),
          allowedApps: [],
          maxConcurrency: Number(concurrency) || 1,
          stopOnCaptcha: true,
          paused,
          pauseReason: paused ? 'Paused from dashboard' : '',
        }),
      });
      setMessage('Policies saved.');
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : 'Save failed');
    }
  }

  async function uploadCv(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setUploading(true);
    setMessage(null);
    try {
      const form = new FormData(e.currentTarget);
      await fetch('/api/documents', { method: 'POST', body: form, credentials: 'include' });
      setMessage('Document uploaded.');
      await load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  }

  async function setDefault(id: string) {
    await api(`/documents/${id}/default`, { method: 'POST' });
    await load();
  }

  return (
    <div className="space-y-6">
      <h1 className="text-lg font-semibold">Settings</h1>
      {message ? <p className="text-sm text-slate-300">{message}</p> : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="mb-3 text-sm font-medium">Profile</h2>
          <div className="space-y-3">
            <Field label="Headline">
              <Input value={profile.headline} onChange={(e) => setProfile({ ...profile, headline: e.target.value })} placeholder="UI/UX Designer" />
            </Field>
            <Field label="Summary">
              <Textarea value={profile.summary} onChange={(e) => setProfile({ ...profile, summary: e.target.value })} className="min-h-24" />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Years experience">
                <Input
                  type="number"
                  value={profile.yearsExperience}
                  onChange={(e) => setProfile({ ...profile, yearsExperience: Number(e.target.value) })}
                />
              </Field>
              <Field label="Work authorization">
                <Input value={profile.workAuthorization} onChange={(e) => setProfile({ ...profile, workAuthorization: e.target.value })} placeholder="Authorized" />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Skills (comma separated)">
                <Input value={profile.skills.join(', ')} onChange={(e) => setProfile({ ...profile, skills: listFromInput(e.target.value) })} />
              </Field>
              <Field label="Locations (comma separated)">
                <Input value={profile.locations.join(', ')} onChange={(e) => setProfile({ ...profile, locations: listFromInput(e.target.value) })} />
              </Field>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Currency">
                <Input value={profile.currency} onChange={(e) => setProfile({ ...profile, currency: e.target.value })} />
              </Field>
              <Field label="Salary min">
                <Input
                  type="number"
                  value={profile.expectedSalaryMin ?? ''}
                  onChange={(e) => setProfile({ ...profile, expectedSalaryMin: e.target.value ? Number(e.target.value) : null })}
                />
              </Field>
              <Field label="Salary max">
                <Input
                  type="number"
                  value={profile.expectedSalaryMax ?? ''}
                  onChange={(e) => setProfile({ ...profile, expectedSalaryMax: e.target.value ? Number(e.target.value) : null })}
                />
              </Field>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={profile.remotePreferred}
                onChange={(e) => setProfile({ ...profile, remotePreferred: e.target.checked })}
                className="h-4 w-4 accent-indigo-500"
              />
              Prefer remote roles
            </label>
            <Button onClick={() => void saveProfile()}>Save profile</Button>
          </div>
        </Card>

        <div className="space-y-6">
          <Card>
            <h2 className="mb-3 text-sm font-medium">Job preferences</h2>
            <div className="space-y-3">
              <Field label="Portals">
                <Input value={prefs.portals.join(', ')} onChange={(e) => setPrefs({ ...prefs, portals: listFromInput(e.target.value) })} />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Job types">
                  <Input value={prefs.jobTypes.join(', ')} onChange={(e) => setPrefs({ ...prefs, jobTypes: listFromInput(e.target.value) })} placeholder="Full-time, Remote" />
                </Field>
                <Field label="Locations">
                  <Input value={prefs.locations.join(', ')} onChange={(e) => setPrefs({ ...prefs, locations: listFromInput(e.target.value) })} />
                </Field>
              </div>
              <Field label="Keywords">
                <Input value={prefs.keywords.join(', ')} onChange={(e) => setPrefs({ ...prefs, keywords: listFromInput(e.target.value) })} placeholder="UI, Figma, Framer" />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Min score">
                  <Input
                    type="number"
                    value={prefs.minMatchScore}
                    onChange={(e) => setPrefs({ ...prefs, minMatchScore: Number(e.target.value) })}
                  />
                </Field>
                <div className="flex items-end gap-3">
                  <label className="flex items-center gap-2 pb-2 text-sm">
                    <input
                      type="checkbox"
                      checked={prefs.requireApproval}
                      onChange={(e) => setPrefs({ ...prefs, requireApproval: e.target.checked })}
                      className="h-4 w-4 accent-indigo-500"
                    />
                    Require approval
                  </label>
                </div>
              </div>
              <Button onClick={() => void savePreferences()}>Save preferences</Button>
            </div>
          </Card>

          <Card>
            <h2 className="mb-3 text-sm font-medium">Agent safety</h2>
            <div className="space-y-3">
              <Field label="Allowed domains (comma separated)">
                <Input value={domains} onChange={(e) => setDomains(e.target.value)} />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Max concurrency">
                  <Input type="number" value={concurrency} onChange={(e) => setConcurrency(e.target.value)} />
                </Field>
                <label className="flex items-end gap-2 pb-2 text-sm">
                  <input
                    type="checkbox"
                    checked={paused}
                    onChange={(e) => setPaused(e.target.checked)}
                    className="h-4 w-4 accent-indigo-500"
                  />
                  Pause agent
                </label>
              </div>
              <Button onClick={() => void savePolicies()}>Save policies</Button>
            </div>
          </Card>
        </div>
      </div>

      <Card>
        <h2 className="mb-3 text-sm font-medium">Documents</h2>
        <form onSubmit={(e) => void uploadCv(e)} className="mb-4 flex flex-wrap items-end gap-3">
          <Field label="CV / cover letter">
            <input type="file" name="file" required className="block w-full text-sm text-slate-400 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-800 file:px-3 file:py-2 file:text-sm file:text-slate-200" />
          </Field>
          <Button type="submit" loading={uploading}>
            Upload
          </Button>
        </form>
        {settings && settings.documents.length > 0 ? (
          <ul className="space-y-2">
            {settings.documents.map((d) => (
              <li key={d.id} className="flex items-center justify-between gap-3 rounded-lg border border-slate-800 p-3 text-sm">
                <span className="text-slate-200">{d.filename}</span>
                <span className="flex items-center gap-2">
                  <Badge>{d.kind}</Badge>
                  {d.isDefault ? <Badge className="border-emerald-500/30 bg-emerald-500/15 text-emerald-300">default CV</Badge> : null}
                  {!d.isDefault && d.kind === 'cv' ? (
                    <Button variant="ghost" onClick={() => void setDefault(d.id)}>
                      Use as default
                    </Button>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-slate-500">No documents yet.</p>
        )}
      </Card>
    </div>
  );
}