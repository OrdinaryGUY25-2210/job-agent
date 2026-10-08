import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import ws from '@fastify/websocket';
import multipart from '@fastify/multipart';
import { HttpError } from './lib/http.js';
import { userPlugin } from './plugins/user.js';
import { registerWebSocket } from './ws/hub.js';
import { authRoutes } from './routes/auth.js';
import { settingsRoutes } from './routes/settings.js';
import { jobsRoutes } from './routes/jobs.js';
import { approvalsRoutes } from './routes/approvals.js';
import { applicationsRoutes } from './routes/applications.js';
import { answersRoutes } from './routes/answers.js';
import { agentRoutes } from './routes/agent.js';
import { exportRoutes } from './routes/export.js';
import { env, IS_PROD } from './env.js';

export function buildApp(): FastifyInstance {
  const app = Fastify({
    logger: {
      name: 'jobagent-api',
      level: process.env['LOG_LEVEL'] ?? (IS_PROD ? 'info' : 'debug'),
      ...(IS_PROD
        ? {}
        : {
            transport: {
              target: 'pino-pretty',
              options: { colorize: true, translateTime: 'SYS:HH:MM:ss' },
            },
          }),
    },
    trustProxy: true,
    bodyLimit: 1024 * 1024 * 8,
  });

  void app.register(cors, { origin: env.WEB_ORIGIN, credentials: true, methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'] });
  void app.register(cookie);
  void app.register(ws);
  void app.register(multipart, { limits: { fileSize: 10 * 1024 * 1024 } });

  void app.register(userPlugin);

  app.setErrorHandler((err, req, reply) => {
    if (err instanceof HttpError) {
      reply.status(err.status).send({ error: err.message });
      return;
    }
    if (err && typeof err === 'object' && 'code' in err && (err as { code: string }).code === 'FST_ERR_VALIDATION') {
      reply.status(400).send({ error: 'Invalid request' });
      return;
    }
    req.log.error(err);
    for (const line of ['payload too large', 'request entity too large']) {
      if (String((err as { message?: string } | undefined)?.message ?? '').toLowerCase().includes(line)) {
        reply.status(413).send({ error: 'Payload too large' });
        return;
      }
    }
    reply.status(500).send({ error: 'Internal server error' });
  });

  app.get('/api/health', async () => ({ ok: true, uptime: process.uptime() }));

  app.get('/api/diag', async (req) => {
    const { jwtVerify } = await import('jose');
    const { extractToken } = await import('./lib/auth.js');
    const token = extractToken(req);
    const secret = new TextEncoder().encode(process.env['JWT_SECRET'] ?? '');
    let verified = false;
    let error = '';
    try {
      await jwtVerify(token ?? '', secret, { algorithms: ['HS256'] });
      verified = true;
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    }
    return {
      jwtSecretEnvLength: (process.env['JWT_SECRET'] ?? '').length,
      tokenFoundByHook: !!token,
      userSetByHook: !!req.user,
      verified,
      error,
    };
  });

  void app.register(authRoutes, { prefix: '/api/auth' });
  void app.register(settingsRoutes, { prefix: '/api' });
  void app.register(jobsRoutes, { prefix: '/api' });
  void app.register(approvalsRoutes, { prefix: '/api' });
  void app.register(applicationsRoutes, { prefix: '/api' });
  void app.register(answersRoutes, { prefix: '/api' });
  void app.register(agentRoutes, { prefix: '/api' });
  void app.register(exportRoutes, { prefix: '/api' });

  registerWebSocket(app);

  return app;
}