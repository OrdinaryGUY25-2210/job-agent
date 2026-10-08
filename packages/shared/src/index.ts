const STOPWORDS = new Set(
  (
    'a an and are as at be by for from has have in is it its of on or that the to was were will with you your ' +
    'do does did not no can we they this that these those should would could about please me my i im are'
  )
    .split(' ')
    .filter(Boolean),
);

function tokens(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s+-]/g, ' ')
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 1 && !STOPWORDS.has(t));
}

/** Lowercase + strip punctuation/spacing so near-identical questions match. */
export function normalizeQuestion(q: string): string {
  return tokens(q).sort().join(' ');
}

/** Token overlap 0..1, biased for short questions (answer-memory matching). */
export function tokenOverlap(a: string, b: string): number {
  const ta = tokens(a);
  const tb = tokens(b);
  if (ta.length === 0 && tb.length === 0) return 1;
  if (ta.length === 0 || tb.length === 0) return 0;
  const big = ta.length >= tb.length ? ta : tb;
  const small = ta.length >= tb.length ? tb : ta;
  const count = big.filter((t) => small.includes(t)).length;
  return count / big.length;
}

export async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const buf = await globalThis.crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Deterministic unique key for an application.
 * Priority: externalJobId > normalized url > company+position.
 */
export function applicationKey({
  portal,
  externalJobId,
  jobUrl,
  company,
  position,
}: {
  portal: string;
  externalJobId: string | null;
  jobUrl: string;
  company: string;
  position: string;
}): string {
  const normUrl = normalizeUrl(jobUrl);
  const companyPos = `${company.trim().toLowerCase()}|${position.trim().toLowerCase()}`;
  const value = externalJobId?.trim().toLowerCase() || normUrl || companyPos;
  return `${portal.trim().toLowerCase()}:${value}`;
}

export function normalizeUrl(u: string): string {
  return u
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/\/+$/, '')
    .replace(/#.*$/, '')
    .replace(/\?.*$/, '')
    .toLowerCase();
}

/** Split titles/descriptions into low-signal keyword tokens for match scoring. */
export function explodeKeywords(...parts: Array<string | string[] | null | undefined>): string[] {
  const out: string[] = [];
  for (const p of parts) {
    if (!p) continue;
    const list = Array.isArray(p) ? p : [p];
    for (const s of list) {
      for (const tok of s.split(/[\s,;&|/]+/)) {
        const t = tok.trim().toLowerCase();
        if (t.length > 1 && !STOPWORDS.has(t)) out.push(t);
      }
    }
  }
  return out;
}

export * from './export.js';