/**
 * פעולות ניהול של מערכת התיקונים: מינוי מתנדבים, רשימת מטפלים, מתג השירות.
 */
import mongoose from 'mongoose';
import User from '../../models/User.js';
import { canHandleCorrections, canManageCorrections, canConfigureCorrections } from '../roles.js';
import { setVerifyPaused } from './runtime.js';

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

export async function setServicePaused({ user, paused }) {
  if (!canConfigureCorrections(user)) return err(403, 'Forbidden');
  if (typeof paused !== 'boolean') return err(400, 'invalid_request');
  await setVerifyPaused(paused, user);
  return ok({ verifyPaused: paused });
}
