/**
 * POST /api/app-reports/github-webhook — אירועי issues מ-GitHub, כמסלול מהיר לצד ה-cron.
 * האירוע משמש טריגר בלבד: המצב נקרא מחדש מ-GitHub, כך שגם משלוח חתום שהוקלט ושודר שוב לא ישקר.
 */
import crypto from 'crypto';
import connectDBDefault from '../db.js';
import AppReport from '../../models/AppReport.js';
import { getAppReportsConfig } from './config.js';
import { createGithubClient } from './github.js';
import { handleIssueStateChange } from './state-change.js';
import { DEFAULT_PRODUCT, getProduct, productByRepo, productFilter } from './products.js';

// אירוע issues אמיתי קטן בהרבה; התקרה נאכפת לפני חישוב החתימה.
export const MAX_WEBHOOK_BODY_BYTES = 1024 * 1024;
const HANDLED_ACTIONS = new Set(['closed', 'reopened']);

const empty = (status) => new Response(null, { status });
const json = (body, status) => Response.json(body, { status, headers: { 'cache-control': 'no-store' } });

/** השוואת חתימת `X-Hub-Signature-256` מול HMAC-SHA256 של הגוף הגולמי, בזמן קבוע. */
export function verifyGithubSignature(rawBody, header, secret) {
  if (!secret || typeof header !== 'string' || !header.startsWith('sha256=')) return false;
  const expected = Buffer.from(`sha256=${crypto.createHmac('sha256', secret).update(rawBody).digest('hex')}`);
  const received = Buffer.from(header);
  return received.length === expected.length && crypto.timingSafeEqual(received, expected);
}

async function readRawBodyLimited(request, maxBytes) {
  const declared = Number(request.headers.get('content-length') || '');
  if (Number.isFinite(declared) && declared > maxBytes) return null;
  if (!request.body) return Buffer.alloc(0);
  const reader = request.body.getReader();
  const chunks = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    if (received > maxBytes) {
      try { await reader.cancel(); } catch { /* כבר נסגר */ }
      return null;
    }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks);
}

/**
 * @param {Request} request
 * @param {{config?:object, connectDB?:Function, fetchImpl?:Function, githubFor?:(product:string) => object|null, sendClosedMail:Function,
 *          schedule?:(work:() => Promise<void>) => void, Model?:object}} deps
 *   schedule — מריץ את העבודה אחרי התשובה (ב-route: `after`); GitHub מוותר על משלוח אחרי 10 שניות.
 */
export async function handleGithubWebhook(request, deps) {
  const config = deps.config || getAppReportsConfig();
  if (!config.webhookSecret) return json({ error: 'Webhook not configured' }, 503);

  const raw = await readRawBodyLimited(request, MAX_WEBHOOK_BODY_BYTES);
  if (raw === null) return json({ error: 'Body too large' }, 413);
  if (!verifyGithubSignature(raw, request.headers.get('x-hub-signature-256'), config.webhookSecret)) {
    return json({ error: 'Invalid signature' }, 401);
  }

  const event = request.headers.get('x-github-event');
  if (event !== 'issues') return empty(204);

  let payload;
  try {
    payload = JSON.parse(raw.toString('utf8'));
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  const number = payload?.issue?.number;
  const repo = payload?.repository?.full_name;
  if (!HANDLED_ACTIONS.has(payload?.action) || !Number.isInteger(number) || payload.issue.pull_request) return empty(204);
  // כל ריפו רשום ממופה למוצר שלו; ריפו אחר — מתעלמים
  const product = productByRepo(repo);
  if (!product) return empty(204);
  if (!config.githubToken && !deps.githubFor) return json({ error: 'GitHub token not configured' }, 503);

  const work = () => syncIssueFromGithub(number, { ...deps, config, product });
  if (deps.schedule) {
    deps.schedule(work);
    return empty(202);
  }
  await work();
  return empty(202);
}

/**
 * קורא את ה-issue מ-GitHub ומעדכן את הדיווחים המקושרים; issue שאינו שלנו מתעלם. לעולם אינו זורק.
 * @param {number} number
 * @param {{product?:string, config:object, githubFor?:Function, fetchImpl?:Function, connectDB?:Function, Model?:object, sendClosedMail:Function}} deps
 */
export async function syncIssueFromGithub(number, deps) {
  const product = deps.product || DEFAULT_PRODUCT;
  try {
    await (deps.connectDB || connectDBDefault)();
    const Model = deps.Model || AppReport;
    if (!(await Model.exists({ ...productFilter(product), issueNumber: number }))) return;
    const github = deps.githubFor
      ? deps.githubFor(product)
      : createGithubClient({ token: deps.config.githubToken, repo: getProduct(product).repo, fetchImpl: deps.fetchImpl });
    if (!github) return;
    const issue = await github.getIssue(number);
    await handleIssueStateChange(issue, { ...deps, product, now: new Date() });
  } catch (error) {
    // ה-cron יסנכרן את ה-issue בריצה הבאה.
    console.error(`App reports webhook: ${product} issue #${number} failed:`, error?.message);
  }
}
