/**
 * טעינת ההגדרות בזמן ריצה: env (סודות בלבד) + מתגי ההתנהגות מ-SystemConfig,
 * שנערכים במסך הניהול: קליטה, מצב פרסום, פרסום אוטומטי והשהיית שירות הבדיקה.
 */
import os from 'os';
import { timingSafeEqual } from 'crypto';
import SystemConfig from '../../models/SystemConfig.js';
import { getCorrectionsConfig, PUBLISH_MODES } from './config.js';

export const RUNTIME_KEY = 'corrections.runtime';
const RUNTIME_LABEL = 'תיקוני טקסט — מתגי המערכת';

/** ברירות המחדל כשאין מסמך, וגם התיקון לערך פגום. */
export function normalizeRuntimeFlags(value = {}) {
  const v = value && typeof value === 'object' ? value : {};
  return {
    verifyPaused: v.verifyPaused === true,
    intakeEnabled: v.intakeEnabled !== false,
    publishMode: PUBLISH_MODES.includes(v.publishMode) ? v.publishMode : 'disabled',
    autoPublish: v.autoPublish === true,
  };
}

export async function loadRuntimeFlags() {
  const doc = await SystemConfig.findOne({ key: RUNTIME_KEY }).lean();
  return normalizeRuntimeFlags(doc?.value);
}

export async function loadCorrectionsConfig(env = process.env) {
  return getCorrectionsConfig(env, await loadRuntimeFlags());
}

/** מעדכן תת-קבוצה של המתגים ומשאיר את השאר; מחזיר את המצב אחרי העדכון. */
export async function setRuntimeFlags(patch, user) {
  const current = await loadRuntimeFlags();
  const next = normalizeRuntimeFlags({ ...current, ...patch });
  // כתיבה בנתיבים מנוקדים: עדכון מקביל של מתג אחר לא נדרס.
  const $set = { label: RUNTIME_LABEL, lastUpdatedBy: user?._id ?? null };
  for (const key of Object.keys(patch || {})) {
    if (key in next) $set[`value.${key}`] = next[key];
  }
  // בלי $setOnInsert על `value`: הוא מתנגש עם נתיב מנוקד. מסמך חדש נוצר עם המתגים ששונו,
  // והשאר נקרא כברירת מחדל ב-normalizeRuntimeFlags.
  await SystemConfig.updateOne({ key: RUNTIME_KEY }, { $set }, { upsert: true });
  return next;
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
