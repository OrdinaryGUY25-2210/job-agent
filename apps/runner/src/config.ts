import { z } from 'zod';
import { loadEnvFile } from '../../../scripts/load-env.mjs';

loadEnvFile();

const schema = z.object({
  RUNNER_API_URL: z.string().url().default('http://localhost:3001'),
  RUNNER_EMAIL: z.string().email().optional(),
  RUNNER_PASSWORD: z.string().optional(),
  RUNNER_PROFILE_DIR: z.string().optional(),
  RUNNER_CV_DIR: z.string().optional(),
  RUNNER_HEADLESS: z
    .string()
    .optional()
    .transform((v) => v === 'true' || v === '1'),
  ALLOWED_DOMAINS: z.string().default('linkedin.com,jobstreet.co.id,glints.com,indeed.com'),
  LOG_LEVEL: z.string().optional(),
});

export type RunnerConfig = z.infer<typeof schema>;

export const config: RunnerConfig = schema.parse(process.env);

export const allowedDomains: string[] = config.ALLOWED_DOMAINS.split(',').map((d) => d.trim().toLowerCase()).filter(Boolean);