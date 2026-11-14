/**
 * נתיבי השירות של הבדיקה האוטומטית (/api/app-reports/triage). האימות: Bearer APP_REPORTS_TRIAGE_SECRET.
 * החוזה מול השירות: docs/app-reports/TRIAGE.md. 401/503 = תצורה; 409 = הדיווח כבר לא ממתין; 5xx = זמני.
 */
import connectDBDefault from '../db.js';
import { readJsonBodyLimited } from '../corrections/report-email.js';
import { getAppReportsConfig } from './config.js';
import { bearerMatches } from './inbound-handler.js';
import { applyTriageDecision, getTriageMaterial, getTriageStatus, listTriageQueue, loadTriageFile } from './triage-decision.js';

const MAX_DECISION_BYTES = 64 * 1024;
const json = (body, status = 200) => Response.json(body, { status, headers: { 'cache-control': 'no-store' } });

async function authorize(request, deps) {
  const config = deps.config || getAppReportsConfig();
  if (!config.triageSecret) return { response: json({ error: 'Triage not configured' }, 503) };
  if (!bearerMatches(request, config.triageSecret)) return { response: json({ error: 'Unauthorized' }, 401) };
  await (deps.connectDB || connectDBDefault)();
  return { config };
}

/** GET /api/app-reports/triage — התור. */
export async function handleTriageQueueGet(request, deps = {}) {
  const auth = await authorize(request, deps);
  if (auth.response) return auth.response;
  try {
    return json(await listTriageQueue());
  } catch (error) {
    console.error('Triage queue failed:', error?.message);
    return json({ error: 'Failed to list queue' }, 500);
  }
}

/** GET /api/app-reports/triage/[reportId] — מצב דיווח אחד. */
export async function handleTriageStatusGet(request, reportId, deps = {}) {
  const auth = await authorize(request, deps);
  if (auth.response) return auth.response;
  try {
    const status = await getTriageStatus(String(reportId));
    return status ? json(status) : json({ error: 'Report not found' }, 404);
  } catch (error) {
    console.error('Triage status failed:', error?.message);
    return json({ error: 'Failed to load status' }, 500);
  }
}

/** GET /api/app-reports/triage/[reportId]/report — חומר הבדיקה. */
export async function handleTriageMaterialGet(request, reportId, deps = {}) {
  const auth = await authorize(request, deps);
  if (auth.response) return auth.response;
  try {
    const material = await getTriageMaterial(String(reportId));
    return material ? json(material) : json({ error: 'Report not found' }, 404);
  } catch (error) {
    console.error('Triage material failed:', error?.message);
    return json({ error: 'Failed to load report' }, 500);
  }
}

/** GET /api/app-reports/triage/[reportId]/files/[kind] — קובץ מהדיווח. deps.readFile קורא מ-GridFS. */
export async function handleTriageFileGet(request, reportId, kind, deps = {}) {
  const auth = await authorize(request, deps);
  if (auth.response) return auth.response;
  try {
    const file = await loadTriageFile(String(reportId), String(kind), deps.readFile);
    if (!file) return json({ error: 'File not found' }, 404);
    return new Response(file.buffer, {
      status: 200,
      headers: { 'content-type': file.contentType, 'x-content-type-options': 'nosniff', 'cache-control': 'no-store' },
    });
  } catch (error) {
    console.error('Triage file failed:', error?.message);
    return json({ error: 'Failed to load file' }, 500);
  }
}

/** POST /api/app-reports/triage/[reportId] — ההחלטה. deps.sendContactMail שולח את שאלות הבדיקה למדווח. */
export async function handleTriageDecisionPost(request, reportId, deps = {}) {
  const auth = await authorize(request, deps);
  if (auth.response) return auth.response;
  let raw;
  try {
    raw = await readJsonBodyLimited(request, MAX_DECISION_BYTES);
  } catch (err) {
    if (err?.code === 'BODY_TOO_LARGE') return json({ error: 'Body too large' }, 413);
    return json({ error: 'Invalid JSON body' }, 400);
  }
  try {
    const result = await applyTriageDecision(String(reportId), raw, { ...deps, config: auth.config });
    return json(result.body, result.status);
  } catch (error) {
    console.error('Triage decision failed:', error?.message);
    return json({ error: 'Failed to apply decision' }, 500);
  }
}
