/**
 * פעולות ניהול של מערכת התיקונים: מינוי מתנדבים, רשימת מטפלים, מתגי המערכת.
 */
import mongoose from 'mongoose';
import User from '../../models/User.js';
import { canHandleCorrections, canManageCorrections, canConfigureCorrections } from '../roles.js';
import { setRuntimeFlags } from './runtime.js';
import { PUBLISH_MODES } from './config.js';

const ok = (body) => ({ status: 200, body });
const err = (status, error) => ({ status, body: { error } });
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export async function listHandlers({ user }) {
  if (!canHandleCorrections(user)) return err(403, 'Forbidden');
  const users = await User.find({ $or: [{ role: { $in: ['admin', 'admin_books'] } }, { isCorrectionsVolunteer: true }] })
    .select('name role isCorrectionsVolunteer').sort({ name: 1 }).limit(500).lean();
  return ok({ users: users.map((u) => ({ id: String(u._id), name: u.name, role: u.role, volunteer: u.isCorrectionsVolunteer === true })) });
}

export async function searchUsers({ user, q }) {
  if (!canManageCorrections(user)) return err(403, 'Forbidden');
  const query = typeof q === 'string' ? q.trim().slice(0, 60) : '';
  const filter = query
    ? { $or: [{ name: { $regex: escapeRe(query), $options: 'i' } }, { email: { $regex: escapeRe(query), $options: 'i' } }] }
    : { isCorrectionsVolunteer: true };
  const users = await User.find(filter).select('name role isCorrectionsVolunteer').sort({ name: 1 }).limit(30).lean();
  return ok({ users: users.map((u) => ({ id: String(u._id), name: u.name, role: u.role, volunteer: u.isCorrectionsVolunteer === true, handles: canHandleCorrections(u) })) });
}

export async function setVolunteer({ user, targetUserId, value }) {
  if (!canManageCorrections(user)) return err(403, 'Forbidden');
  if (typeof targetUserId !== 'string' || !mongoose.isValidObjectId(targetUserId) || typeof value !== 'boolean') return err(400, 'invalid_request');
  const res = await User.updateOne({ _id: targetUserId }, { $set: { isCorrectionsVolunteer: value } });
  if (!res.matchedCount) return err(404, 'not_found');
  return ok({ ok: true });
}

/**
 * מעדכן את מתגי ההתנהגות מהמסך. כל מתג אופציונלי; ערך שאינו מהטיפוס/מהרשימה נדחה
 * בלי לשנות דבר, כדי שלא ייכתב מצב ביניים.
 */
export async function setSettings({ user, patch }) {
  if (!canConfigureCorrections(user)) return err(403, 'Forbidden');
  if (!patch || typeof patch !== 'object') return err(400, 'invalid_request');
  const next = {};
  for (const key of ['verifyPaused', 'intakeEnabled', 'autoPublish']) {
    if (patch[key] === undefined) continue;
    if (typeof patch[key] !== 'boolean') return err(400, 'invalid_request');
    next[key] = patch[key];
  }
  if (patch.publishMode !== undefined) {
    if (!PUBLISH_MODES.includes(patch.publishMode)) return err(400, 'invalid_publish_mode');
    next.publishMode = patch.publishMode;
  }
  if (!Object.keys(next).length) return err(400, 'invalid_request');
  // מעבר לכתיבה בלי אדם במסלול מחייב אישור מפורש בגוף הבקשה, לא רק דיאלוג בדפדפן.
  if ((next.publishMode === 'direct' || next.autoPublish === true) && patch.confirm !== true) {
    return err(400, 'confirmation_required');
  }
  return ok(await setRuntimeFlags(next, user));
}
