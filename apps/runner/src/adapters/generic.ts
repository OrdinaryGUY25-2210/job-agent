import type { Page } from 'playwright';
import type { DiscoveredJob } from '@jobagent/types';
import { absoluteUrl } from '../allowlist.js';
import type { ApplyForm, ApplyOutcome, ApplyPage, PortalAdapter } from './base.js';

/**
 * Generic DOM-based adapter. Works for most portals when they expose job
 * links in anchors; apply logic is intentionally conservative and stops
 * instead of guessing.
 */
interface RawLink {
  href: string;
  text: string;
  title: string;
  aria: string;
  company: string;
  location: string;
}

const EXTRACT_JOB_LINKS = `els => {
  const jobHint = /\\/(jobs|job|job-openings|refer|careers\\/job)(\\/|\\?|$)/i;
  const clean = (s) => (s == null ? '' : String(s)).replace(/\\s+/g, ' ').trim();
  const pick = (root, sels) => {
    if (!root || !root.querySelector) return '';
    for (const sel of sels) {
      const el = root.querySelector(sel);
      const t = clean(el ? el.textContent : null);
      if (t) return t;
    }
    return '';
  };
  return els
    .filter((a) => {
      const href = a.getAttribute('href') || '';
      return /^(https?:)?(\\/\\/)?[^/]/.test(href) || href.startsWith('/');
    })
    .map((a) => {
      const card = a.closest('li') || a.closest('article') || a.closest('[class*="card"]') || a.parentElement;
      return {
        href: a.getAttribute('href') || '',
        text: clean(a.textContent).slice(0, 300),
        title: a.getAttribute('title') || '',
        aria: a.getAttribute('aria-label') || '',
        company: pick(card, ['[class*="subtitle"]', '[class*="company"]', '[class*="employer"]', 'h4']).slice(0, 300),
        location: pick(card, ['[class*="location"]', '[class*="workplace"]', '[class*="loc"]', 'address']).slice(0, 300),
      };
    })
    .filter((l) => jobHint.test(l.href) || /linkedin\\.com\\/jobs\\/view\\//i.test(l.href));
}`;

export class GenericAdapter implements PortalAdapter {
  portal: string;

  constructor(portal: string) {
    this.portal = portal;
  }

  discoverUrl(context: { query: string }): string | null {
    if (this.portal === 'linkedin.com' || this.portal === 'linkedin') {
      return context.query
        ? `https://www.linkedin.com/jobs/search/?keywords=${encodeURIComponent(context.query)}`
        : 'https://www.linkedin.com/jobs/';
    }
    if (this.portal === 'jobstreet.co.id' || this.portal === 'jobstreet') {
      return context.query
        ? `https://www.jobstreet.co.id/id/job-search/${encodeURIComponent(context.query).replace(/%20/g, '-')}/`
        : 'https://www.jobstreet.co.id/';
    }
    if (this.portal === 'glints.com' || this.portal === 'glints') {
      return context.query
        ? `https://glints.com/id/opportunities/jobs/explore?keyword=${encodeURIComponent(context.query)}`
        : 'https://glints.com/id/opportunities/jobs';
    }
    if (this.portal === 'indeed.com' || this.portal === 'indeed') {
      return context.query ? `https://id.indeed.com/jobs?q=${encodeURIComponent(context.query)}` : 'https://id.indeed.com/';
    }
    if (this.portal.includes('://') || !this.portal.includes('.')) return null;
    return context.query ? `https://${this.portal}/jobs?q=${encodeURIComponent(context.query)}` : `https://${this.portal}/`;
  }

  async extractJobs(page: Page): Promise<DiscoveredJob[]> {
    const current = page.url();
    const raw = (await page.$$eval('a[href]', EXTRACT_JOB_LINKS)) as RawLink[];

    const jobs: DiscoveredJob[] = [];
    for (const link of raw) {
      const url = absoluteUrl(current, link.href);
      if (url === current || jobs.some((j) => j.jobUrl === url)) continue;
      const title = (link.title || link.aria || link.text || 'Unknown position').slice(0, 300);
      if (title.length < 2) continue;
      jobs.push({
        externalJobId: extractExternalId(url),
        portal: this.portal,
        jobUrl: url,
        title,
        company: (link.company ?? '').slice(0, 300),
        location: (link.location ?? '').slice(0, 300),
        salaryText: '',
        salaryMin: null,
        salaryMax: null,
        description: '',
        requirements: [],
        employmentType: '',
        postedAt: null,
        raw: null,
      });
      if (jobs.length >= 40) break;
    }
    return jobs;
  }

  async apply(ctx: ApplyPage): Promise<ApplyOutcome> {
    const { page, form, answerOrNull } = ctx;
    await page.waitForLoadState('domcontentloaded', { timeout: 15000 }).catch(() => undefined);

    if (await page.locator('input[type=password]').count()) {
      return stop('unexpected_page', 'Password field detected — the agent never fills passwords.');
    }
    if (await hasCaptcha(page)) {
      return stop('captcha', 'CAPTCHA detected. Complete it manually, then resume.');
    }

    const applyButton = page
      .getByRole('button', { name: /easy apply|apply now|apply(?!ed)/i })
      .or(page.getByText(/^apply now$/i))
      .or(page.locator('button:has-text("Easy Apply")'))
      .first();

    if (!(await applyButton.isVisible().catch(() => false))) {
      // maybe an "already applied" state
      return stop('no_apply_button', 'No apply button detected on the job page.');
    }
    await applyButton.click();
    await page.waitForTimeout(1200);

    if (await hasCaptcha(page)) return stop('captcha', 'CAPTCHA appeared after opening the application.');

    const inputs = page.locator('input, textarea, select').count().catch(() => 0);
    if (!(await inputs)) return stop('form_not_detected', 'No form fields detected in the application flow.');

    await fillKnownFields(page, form);

    const unanswered: string[] = [];
    const questionFields = page.locator('textarea, [data-question], input[data-question], label:has(textarea)').count().catch(() => 0);
    const pool = Math.max(Number(await questionFields), 0);

    for (let i = 0; i < pool && i < 8; i++) {
      const field = page.locator('textarea').nth(i);
      const label = await field.getAttribute('data-question').catch(() => null) ?? (await page.locator('label').nth(i).textContent().catch(() => null)) ?? '';
      const q = label.trim();
      if (!q) continue;
      const matched = await answerOrNull(q);
      if (matched !== null) {
        await field.fill(matched);
      } else {
        unanswered.push(q);
        break; // stop on the first unknown question — never guess
      }
    }

    if (unanswered.length > 0) {
      return stop('unknown_question', `Question without a known answer: "${unanswered[0]}"`);
    }

    const submit = page.getByRole('button', { name: /submit application|submit|continue/i }).last();
    await submit.click().catch(() => undefined);
    await page.waitForTimeout(1800);
    return { submitted: true };
  }
}

function stop(stopReason: 'captcha' | 'rate_limited' | 'account_warning' | 'unexpected_page' | 'domain_not_allowed' | 'unknown_question' | 'no_apply_button' | 'form_not_detected', detail: string): ApplyOutcome {
  return { submitted: false, stopReason, detail };
}

async function hasCaptcha(page: Page): Promise<boolean> {
  return (
    (await page.locator('iframe[src*="recaptcha"], iframe[src*="hcaptcha"], .g-recaptcha, [aria-label*="captcha" i]').count().catch(() => 0)) > 0
  );
}

async function fillKnownFields(page: Page, form: ApplyForm): Promise<void> {
  const cv = form.cvPath;
  const fileInput = page.locator('input[type=file]').first();
  if (await fileInput.count()) {
    if (!cv) throw new Error('UPLOAD_REQUIRED: application asks for a CV but none is configured');
    await fileInput.setInputFiles(cv);
  }

  // Deterministic, label-driven field fill. Never touches password fields.
  const mappings: Array<{ re: RegExp; get: () => string }> = [
    { re: /headline|title|position/i, get: () => form.headline },
    { re: /years|experience/i, get: () => String(form.yearsExperience) },
    {
      re: /salary|compensation|expected|ekspektasi/i,
      get: () => {
        const [min, max] = form.expectedSalary;
        return max && min ? String(Math.round((min + max) / 2)) : (min ?? max) ? String(min ?? max) : '';
      },
    },
    { re: /skill/i, get: () => form.skills.join(', ') },
    { re: /location|kota/i, get: () => '' },
    { re: /summar|about|intro|deskripsi/i, get: () => form.summary },
    { re: /authoriz|legal to work/i, get: () => form.workAuthorization },
  ];

  for (const input of await page.locator('input:not([type=file]):not([type=password]), textarea').all()) {
    const label = await labelFor(page, input);
    const name = (await input.getAttribute('name')) ?? '';
    const placeholder = (await input.getAttribute('placeholder')) ?? '';
    const id = (await input.getAttribute('id')) ?? '';
    const hint = `${name} ${placeholder} ${id} ${label}`.toLowerCase();
    const found = mappings.find((m) => m.re.test(hint));
    if (!found) continue;
    const value = found.get();
    if (!value) continue;
    const type = await input.getAttribute('type');
    if (type === 'email' || type === 'tel' || type === 'url') continue;
    await input.fill(value).catch(() => undefined);
  }
}

async function labelFor(page: Page, input: import('playwright').Locator): Promise<string> {
  const id = await input.getAttribute('id');
  if (id) {
    const lbl = page.locator(`label[for="${id}"]`);
    if (await lbl.count()) return (await lbl.textContent().catch(() => '')) ?? '';
  }
  const wrapping = page.locator('label:has(input, textarea)');
  for (let i = 0; i < (await wrapping.count().catch(() => 0)) && i < 12; i++) {
    const l = wrapping.nth(i);
    const inside = l.locator('input, textarea').first();
    if (await inside.count()) {
      const idA = await inside.getAttribute('id');
      const idB = await input.getAttribute('id');
      if (idA && idB && idA === idB) return (await l.textContent().catch(() => '')) ?? '';
    }
  }
  return '';
}

function extractExternalId(url: string): string | null {
  const m = url.match(/\/(?:view-)?([A-Za-z0-9_-]{12,})/);
  return m ? m[1] : null;
}

/** LinkedIn adapter — delegates to the generic DOM strategy for now. */
export class LinkedInAdapter implements PortalAdapter {
  portal = 'linkedin';
  private generic = new GenericAdapter('linkedin.com');

  discoverUrl(context: { query: string }): string | null {
    return this.generic.discoverUrl(context);
  }

  extractJobs(page: Page): Promise<DiscoveredJob[]> {
    return this.generic.extractJobs(page);
  }

  apply(ctx: ApplyPage): Promise<ApplyOutcome> {
    return this.generic.apply(ctx);
  }
}

export default GenericAdapter;