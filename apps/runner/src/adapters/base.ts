import type { Page } from 'playwright';
import type { DiscoveredJob } from '@jobagent/types';

export interface DiscoverContext {
  query: string;
}

export interface ApplyForm {
  headline: string;
  summary: string;
  yearsExperience: number;
  skills: string[];
  workAuthorization: string;
  expectedSalary: (number | null)[];
  cvPath: string | null;
}

export interface ApplyPage {
  page: Page;
  form: ApplyForm;
  /** Short-circuit answer injection for known questions (from Answer Memory). */
  answerOrNull: (question: string) => Promise<string | null>;
}

export type ApplyOutcome =
  | { submitted: true; applicationId?: string }
  | { submitted: false; stopReason: string; detail: string };

export interface PortalAdapter {
  portal: string;
  /** Build the search URL for discovery. */
  discoverUrl(context: DiscoverContext): string | null;
  /** Extract job cards from a loaded search page. */
  extractJobs(page: Page): Promise<DiscoveredJob[]>;
  /** Apply for the current job page. */
  apply(ctx: ApplyPage): Promise<ApplyOutcome>;
}