import { normalizeUrl } from '@jobagent/shared';

/**
 * Safety boundary. A domain is allowed when it is the
 * configured domain or a subdomain of it.
 */
export function isAllowed(url: string, allowed: string[]): boolean {
  if (allowed.length === 0) return false;
  const host = new URL(url).hostname.toLowerCase().replace(/^www\./, '');
  return allowed.some((d) => {
    const domain = d.toLowerCase().replace(/^www\./, '');
    return host === domain || host.endsWith(`.${domain}`);
  });
}

/** Extract a canonical URL from a link href (relative URLs resolved against base). */
export function absoluteUrl(base: string, href: string): string {
  return new URL(href, base).toString();
}

export { normalizeUrl };