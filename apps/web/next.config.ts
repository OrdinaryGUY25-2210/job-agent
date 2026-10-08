import type { NextConfig } from 'next';
import { loadEnvFile } from '../../scripts/load-env.mjs';

loadEnvFile();

const apiUrl = process.env['INTERNAL_API_URL'] ?? 'http://localhost:3001';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@jobagent/types', '@jobagent/shared', '@jobagent/ai'],
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${apiUrl}/api/:path*` }];
  },
};

export default nextConfig;