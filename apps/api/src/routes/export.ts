import type { FastifyInstance } from 'fastify';
import { getDb, schema } from '@jobagent/db';
import { toCsv, xlsxBuffer } from '@jobagent/shared';
import { listAllApplicationsForExport } from '../services/applications.js';
import { requireUser } from '../lib/http.js';
import type { Application, ExportFormat } from '@jobagent/types';
import { EXPORT_FORMATS } from '@jobagent/types';

const MIME = {
  csv: 'text/csv; charset=utf-8',
  json: 'application/json; charset=utf-8',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
} as const;

export async function exportRoutes(app: FastifyInstance): Promise<void> {
  app.get('/export/applications', async (req, reply) => {
    const user = requireUser(req);
    const q = req.query as Record<string, string | undefined>;
    const format = (q['format'] ?? 'csv') as ExportFormat;
    if (!EXPORT_FORMATS.includes(format)) return reply.status(400).send({ error: 'Invalid export format' });

    const apps = await listAllApplicationsForExport(user.id);
    const rows = apps.map((a) => exportRow(a));
    const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
    const filename = `applications-${stamp}.${format}`;
    reply.header('Content-Disposition', `attachment; filename="${filename}"`);

    await getDb().insert(schema.exportJobs).values({ userId: user.id, format, rowCount: rows.length });

    if (format === 'csv') return reply.type(MIME.csv).send(toCsv(rows));
    if (format === 'json') return reply.type(MIME.json).send({ applications: rows, total: rows.length });
    const buf = await xlsxBuffer(rows);
    return reply.type(MIME.xlsx).send(buf);
  });
}

function exportRow(a: Application): Record<string, unknown> {
  return {
    application_id: a.id,
    external_job_id: a.externalJobId ?? '',
    company: a.companyName,
    position: a.position,
    portal: a.portal,
    job_url: a.jobUrl,
    location: a.location,
    salary: a.salary,
    status: a.status,
    applied_at: a.appliedAt ?? '',
    match_score: a.matchScore ?? '',
    cv_used: a.cvUsed ?? '',
    source: a.source,
  };
}