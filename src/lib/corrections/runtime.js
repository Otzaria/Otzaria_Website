/**
 * טעינת ההגדרות בזמן ריצה: env + מתג החירום מ-SystemConfig (יכול רק להשהות את השירות).
 */
import os from 'os';
import { timingSafeEqual } from 'crypto';
import SystemConfig from '../../models/SystemConfig.js';
import { getCorrectionsConfig } from './config.js';

export const RUNTIME_KEY = 'corrections.runtime';

export async function loadRuntimeFlags() {
  const doc = await SystemConfig.findOne({ key: RUNTIME_KEY }).lean();
  return { verifyPaused: doc?.value?.verifyPaused === true };
}

export async function loadCorrectionsConfig(env = process.env) {
  return getCorrectionsConfig(env, await loadRuntimeFlags());
}

export async function setVerifyPaused(paused, user) {
  await SystemConfig.updateOne(
    { key: RUNTIME_KEY },
    { $set: { value: { verifyPaused: Boolean(paused) }, label: 'תיקוני טקסט — מתג השירות', lastUpdatedBy: user?._id ?? null } },
    { upsert: true },
  );
}

export const defaultWorkerId = () => `${os.hostname()}:${process.pid}`;

/** אימות Bearer של CRON_SECRET בהשוואה בזמן קבוע. */
export function authorizeCron(request, secret = process.env.CRON_SECRET) {
  if (!secret) return { ok: false, status: 500, error: 'CRON_SECRET not configured' };
  const header = request.headers.get('authorization') || '';
  const provided = header.startsWith('Bearer ') ? header.slice(7) : '';
  const a = Buffer.from(provided);
  const b = Buffer.from(secret);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return { ok: false, status: 401, error: 'Unauthorized' };
  return { ok: true };
}
