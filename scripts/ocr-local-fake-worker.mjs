#!/usr/bin/env node
/**
 * לקוח דמה של עובד ה-OCR המקומי (OtzariaTaskAgent) — לקוח HTTP אמיתי מול שרת רץ (next dev / staging),
 * לבדיקה ידנית של /api/worker/v1 בלי השירות האמיתי ובלי מנוע OCR. לא נצרך בפרודקשן.
 *
 * מה הוא עושה, לכל עבודה ברשימה (או רק --job):
 *   GET /jobs (כולל דפדוף nextCursor) → GET /jobs/{id}/input ואימות sha256 מול inputSha256 ומול
 *   X-Content-SHA256 → POST status (running, ואחריו delivery_pending) → POST result עם טקסט דמה לכל
 *   עמוד (X-Result-SHA256) → [--resend] אותה תוצאה שוב (מצופה already_received) → GET /jobs/{id}.
 *   מדפיס כל תשובה (בלי הסוד).
 *
 * הרצה:
 *   node scripts/ocr-local-fake-worker.mjs --base http://127.0.0.1:3000 --secret-file <path> [--resend]
 *        [--outcome success|partial|failed] [--job <jobId>] [--text "טקסט"]
 *   --secret-file  קובץ שמכיל את OCR_WORKER_SECRET (UTF-8, רווחים בקצוות נחתכים — כמו קובץ הסוד
 *                  של השירות). בלי הדגל: OCR_WORKER_SECRET מהסביבה / מ-.env.
 *   --outcome      success (ברירת מחדל) | partial (העמוד הראשון נכשל) | failed (שגיאה כללית, בלי עמודים)
 *   --resend       שליחה חוזרת של אותה תוצאה בדיוק — בודק אידמפוטנטיות (accepted → already_received)
 *   --job          רק העבודה הזו (ברירת מחדל: כל העבודות שברשימה)
 *   --text         קידומת הטקסט לכל עמוד (ברירת מחדל "טקסט דמה מהעובד המקומי")
 *
 * הערות: reportSeq נגזר מהשעון (עולה גם בין הרצות על אותה עבודה). בשבת/יו"ט שער השבת מחזיר 503
 * {"error":"shabbat"} עם Retry-After — הסקריפט מדפיס ויוצא. ב-dev צריך NEXTAUTH_SECRET בסביבה,
 * אחרת ה-proxy מפנה גם את /api/worker. מדריך: docs/ocr-local-worker/OPERATIONS.md.
 */
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const OUTCOMES = ['success', 'partial', 'failed'];

function parseArgs(argv) {
  const out = { base: 'http://127.0.0.1:3000', secretFile: null, resend: false, outcome: 'success', job: null, text: 'טקסט דמה מהעובד המקומי' };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => {
      const v = argv[++i];
      if (v === undefined) throw new Error(`חסר ערך אחרי ${a}`);
      return v;
    };
    if (a === '--base') out.base = next();
    else if (a === '--secret-file') out.secretFile = next();
    else if (a === '--resend') out.resend = true;
    else if (a === '--outcome') out.outcome = next();
    else if (a === '--job') out.job = next();
    else if (a === '--text') out.text = next();
    else if (a === '--help' || a === '-h') out.help = true;
    else throw new Error(`ארגומנט לא מוכר: ${a}`);
  }
  if (!OUTCOMES.includes(out.outcome)) throw new Error(`--outcome חייב להיות אחד מ: ${OUTCOMES.join(', ')}`);
  out.base = out.base.replace(/\/+$/, '');
  return out;
}

async function readSecret(secretFile) {
  if (secretFile) return (await readFile(secretFile, 'utf8')).trim();
  try {
    (await import('dotenv')).config();
  } catch {
    // dotenv אופציונלי
  }
  return (process.env.OCR_WORKER_SECRET || '').trim();
}

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');
const log = (label, value) => console.log(`${label}: ${typeof value === 'string' ? value : JSON.stringify(value)}`);

function makeClient(base, secret) {
  const url = (p) => `${base}/api/worker/v1${p}`;
  const headers = (extra = {}) => ({ authorization: `Bearer ${secret}`, ...extra });

  async function call(method, p, { body, extraHeaders } = {}) {
    const res = await fetch(url(p), { method, headers: headers(extraHeaders), body, redirect: 'manual' });
    const text = await res.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      // לא JSON (למשל דף שגיאה של nginx או הפניה של ה-proxy)
    }
    return { status: res.status, json, text, headers: res.headers };
  }

  function fail(label, r) {
    const retry = r.headers.get('retry-after');
    const detail = r.json ?? r.text.slice(0, 200);
    throw new Error(`${label} → HTTP ${r.status}${retry ? ` (Retry-After ${retry})` : ''}: ${JSON.stringify(detail)}`);
  }

  return {
    async listAll() {
      const items = [];
      let cursor = null;
      do {
        const q = cursor ? `?limit=100&cursor=${encodeURIComponent(cursor)}` : '?limit=100';
        const r = await call('GET', `/jobs${q}`);
        if (r.status !== 200 || !r.json) fail('GET /jobs', r);
        items.push(...r.json.items);
        cursor = r.json.nextCursor;
      } while (cursor);
      return items;
    },
    async getJob(id) {
      const r = await call('GET', `/jobs/${id}`);
      if (r.status !== 200) fail(`GET /jobs/${id}`, r);
      return r.json;
    },
    async input(id) {
      const res = await fetch(url(`/jobs/${id}/input`), { headers: headers(), redirect: 'manual' });
      if (res.status !== 200) {
        const text = await res.text();
        fail(`GET /jobs/${id}/input`, { status: res.status, json: null, text, headers: res.headers });
      }
      const bytes = Buffer.from(await res.arrayBuffer());
      return { bytes, headerSha: res.headers.get('x-content-sha256') };
    },
    async status(id, report) {
      const r = await call('POST', `/jobs/${id}/status`, {
        body: JSON.stringify(report),
        extraHeaders: { 'content-type': 'application/json; charset=utf-8' },
      });
      if (r.status !== 200) fail(`POST /jobs/${id}/status`, r);
      return r.json;
    },
    async result(id, buf) {
      const r = await call('POST', `/jobs/${id}/result`, {
        body: buf,
        extraHeaders: { 'content-type': 'application/json; charset=utf-8', 'x-result-sha256': sha256(buf) },
      });
      if (r.status !== 200) fail(`POST /jobs/${id}/result`, r);
      return r.json;
    },
  };
}

function resultDoc(env, outcome, textPrefix) {
  const base = { schemaVersion: 1, jobId: env.jobId, inputSha256: env.inputSha256, outcome, pipelineVersion: 'fake-worker-0.1' };
  if (outcome === 'failed') {
    return { ...base, pages: [], error: { code: 'fake_failure', message: 'simulated failure from fake worker' } };
  }
  return {
    ...base,
    pages: env.pageMap.map((e, i) =>
      outcome === 'partial' && i === 0
        ? { pdfPageIndex: e.pdfPageIndex, error: { code: 'fake_page_error', message: 'simulated page failure' } }
        : { pdfPageIndex: e.pdfPageIndex, text: `${textPrefix} — עמוד ${e.pageNumber}` }
    ),
  };
}

async function processJob(client, env, opts) {
  console.log(`\n=== עבודה ${env.jobId} (siteState=${env.siteState}, ${env.pageMap.length} עמודים) ===`);
  const { bytes, headerSha } = await client.input(env.jobId);
  const actual = sha256(bytes);
  log('input bytes', String(bytes.length));
  if (actual !== env.inputSha256 || (headerSha && headerSha !== actual)) {
    throw new Error(`sha256 של הקלט לא תואם: הורד ${actual}, במעטפה ${env.inputSha256}, בכותרת ${headerSha}`);
  }
  log('input sha256', `${actual} (תואם)`);

  const total = env.pageMap.length;
  let seq = Date.now();
  const report = (state, pagesDone) => ({ workerId: env.workerId, state, progress: { phase: state, pagesDone, pagesTotal: total }, reportSeq: ++seq, attempt: 1 });
  const running = await client.status(env.jobId, report('running', 0));
  log('status running', running);
  if (running.cancelRequested) {
    console.log('העבודה בוטלה באתר — שולח תוצאת cancelled');
    const buf = Buffer.from(JSON.stringify({ schemaVersion: 1, jobId: env.jobId, inputSha256: env.inputSha256, outcome: 'cancelled', pipelineVersion: '', pages: [] }), 'utf8');
    log('ack', await client.result(env.jobId, buf));
    return;
  }
  log('status delivery_pending', await client.status(env.jobId, report('delivery_pending', total)));

  // אותם בייטים בדיוק בשליחה החוזרת — אותו hash
  const buf = Buffer.from(JSON.stringify(resultDoc(env, opts.outcome, opts.text)), 'utf8');
  log('result sha256', sha256(buf));
  log('ack', await client.result(env.jobId, buf));
  if (opts.resend) log('ack (שליחה חוזרת)', await client.result(env.jobId, buf));
  log(`GET /jobs/${env.jobId}`, await client.getJob(env.jobId));
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    console.log('node scripts/ocr-local-fake-worker.mjs --base http://127.0.0.1:3000 --secret-file <path> [--resend] [--outcome success|partial|failed] [--job <id>]');
    return;
  }
  const secret = await readSecret(opts.secretFile);
  if (Buffer.byteLength(secret, 'utf8') < 32) throw new Error('הסוד חסר או קצר מ-32 בתים (--secret-file או OCR_WORKER_SECRET)');
  const client = makeClient(opts.base, secret);

  const items = await client.listAll();
  log('GET /jobs', `${items.length} עבודות פתוחות`);
  const targets = opts.job ? items.filter((e) => e.jobId === opts.job) : items;
  if (opts.job && targets.length === 0) {
    console.log(`העבודה ${opts.job} לא ברשימה; מצבה באתר:`);
    log(`GET /jobs/${opts.job}`, await client.getJob(opts.job));
    return;
  }
  if (targets.length === 0) console.log('אין עבודות לעיבוד. צרו עבודה בדיאלוג "OCR לספר שלם" עם "מחשב מקומי".');
  for (const env of targets) await processJob(client, env, opts);
}

main().catch((err) => {
  console.error(`שגיאה: ${err?.message || err}`);
  process.exitCode = 1;
});
