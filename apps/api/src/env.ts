import { z } from 'zod';
import { loadEnvFile } from '../../../scripts/load-env.mjs';

loadEnvFile();

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(3001),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  JWT_SECRET: z.string().min(16, 'JWT_SECRET must be at least 16 chars'),
  WEB_ORIGIN: z.string().default('http://localhost:3000'),
  STORAGE_DIR: z.string().default('./uploads'),
});

export const env = schema.parse(process.env);
export const IS_PROD = env.NODE_ENV === 'production';