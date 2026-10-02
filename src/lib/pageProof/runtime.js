// מתגי הגהת-העמודים בזמן ריצה (SystemConfig 'pageProof.runtime'; הדפוס — lib/corrections/runtime.js):
// היום מתג אחד — האם מתנדבים יכולים לשלוח לזיהוי-מחדש (on / off / auto). הכללים הטהורים —
// recutRules.js (normalizeProofRuntime, recutEffective); המסך — admin/RecutSwitchCard; ה-API —
// api/admin/page-proof/settings. נתיבים יחסיים (לא '@/') — כדי שטסט-האינטגרציה ירוץ ב-node:test.
import mongoose from 'mongoose';
import SystemConfig from '../../models/SystemConfig.js';
import PageProofToken from '../../models/PageProofToken.js';
import { normalizeProofRuntime, recutEffective } from './recutRules.js';

export const PROOF_RUNTIME_KEY = 'pageProof.runtime';
const RUNTIME_LABEL = 'הגהת עמודים — מתגי המערכת';

export async function loadProofRuntime() {
  const doc = await SystemConfig.findOne({ key: PROOF_RUNTIME_KEY }).lean();
  return normalizeProofRuntime(doc?.value);
}

// מעדכן תת-קבוצה של המתגים ומשאיר את השאר (נתיבים מנוקדים — עדכון מקביל של מתג אחר לא נדרס);
// מחזיר את המצב אחרי העדכון
export async function setProofRuntime(patch, user) {
  const next = normalizeProofRuntime({ ...(await loadProofRuntime()), ...(patch || {}) });
  const uid = user?._id ?? user?.id ?? null;
  const $set = { label: RUNTIME_LABEL, lastUpdatedBy: uid != null && mongoose.isValidObjectId(String(uid)) ? String(uid) : null };
  for (const key of Object.keys(patch || {})) {
    if (key in next) $set[`value.${key}`] = next[key];
  }
  await SystemConfig.updateOne({ key: PROOF_RUNTIME_KEY }, { $set }, { upsert: true });
  return next;
}

// מתי תוכנת-הספר נראתה לאחרונה: השימוש האחרון במפתח-גישה פעיל עם הרשאת import (מפתח שבוטל או פג —
// לא נספר). Date או null
export async function bookSoftwareSeenAt(now = new Date()) {
  const t = await PageProofToken.findOne(
    { scopes: 'import', revokedAt: null, expiresAt: { $gt: now }, lastUsedAt: { $ne: null } },
    { lastUsedAt: 1 }
  )
    .sort({ lastUsedAt: -1 })
    .lean();
  return t?.lastUsedAt || null;
}

// המצב לכפתור של המתנדבים: {settings, seenAt, effective}. seenAt נקרא רק כשצריך ('auto'), או תמיד
// (withSeen — למסך הניהול)
export async function recutStatus({ now = new Date(), withSeen = false } = {}) {
  const settings = await loadProofRuntime();
  const seenAt = withSeen || settings.recutRequests === 'auto' ? await bookSoftwareSeenAt(now) : null;
  return { settings, seenAt, effective: recutEffective(settings, seenAt, now) };
}
