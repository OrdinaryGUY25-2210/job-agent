import type { FastifyInstance } from 'fastify';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  addDocument,
  getSettings,
  removeDocument,
  setDefaultCv,
  upsertPolicies,
  upsertPreferences,
  upsertProfile,
} from '../services/settings.js';
import { requireUser } from '../lib/http.js';
import { env } from '../env.js';
import type { DocumentKind } from '@jobagent/types';

export async function settingsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/settings', async (req, reply) => {
    const user = requireUser(req);
    const settings = await getSettings(user.id);
    return reply.send({ settings });
  });

  app.put('/profile', async (req, reply) => {
    const user = requireUser(req);
    const profile = await upsertProfile(user.id, req.body);
    return reply.send({ profile });
  });

  app.put('/preferences', async (req, reply) => {
    const user = requireUser(req);
    const preferences = await upsertPreferences(user.id, req.body);
    return reply.send({ preferences });
  });

  app.put('/policies', async (req, reply) => {
    const user = requireUser(req);
    const policies = await upsertPolicies(user.id, req.body);
    return reply.send({ policies });
  });

  app.post('/documents', async (req, reply) => {
    const user = requireUser(req);
    const part = await req.file();
    if (!part) return reply.status(400).send({ error: 'No file uploaded' });

    const kind = (part.fields['kind'] && 'value' in part.fields['kind'] ? part.fields['kind'].value : 'cv') as DocumentKind;
    const buf = await part.toBuffer();
    const dir = join(env.STORAGE_DIR, user.id);
    await mkdir(dir, { recursive: true });
    const name = `${Date.now()}-${part.filename.replace(/[^\w.-]/g, '_')}`;
    const storageKey = join(user.id, name);
    await writeFile(join(env.STORAGE_DIR, storageKey), buf);

    const document = await addDocument(user.id, {
      kind,
      filename: part.filename,
      storageKey,
      mimeType: part.mimetype ?? null,
      sizeBytes: buf.length,
    });
    return reply.send({ document });
  });

  app.delete('/documents/:id', async (req, reply) => {
    const user = requireUser(req);
    const id = (req.params as { id: string }).id;
    const removed = await removeDocument(user.id, id);
    return reply.send({ removed: !!removed });
  });

  app.post('/documents/:id/default', async (req, reply) => {
    const user = requireUser(req);
    const id = (req.params as { id: string }).id;
    const cv = await setDefaultCv(user.id, id);
    return reply.send({ cv });
  });
}