import mongoose from 'mongoose';
import { sortSpec } from './listSort.js';

export function reportCursor(report, sort) {
  return Buffer.from(JSON.stringify([
    1, sort, report.createdAt?.toISOString() ?? null, String(report._id),
    sort === 'version' ? report.libraryVersionSortKey ?? null : null,
  ])).toString('base64url');
}

export function parseReportCursor(raw, sort) {
  if (typeof raw !== 'string' || raw.length > 400 || !/^[A-Za-z0-9_-]+$/.test(raw)) return null;
  try {
    const value = JSON.parse(Buffer.from(raw, 'base64url').toString());
    if (!Array.isArray(value) || value.length !== 5) return null;
    const [version, order, date, id, key] = value;
    if (version !== 1 || order !== sort || typeof id !== 'string' || !/^[a-f0-9]{24}$/.test(id)) return null;
    if (date !== null && (typeof date !== 'string' || new Date(date).toISOString() !== date)) return null;
    if (key !== null && (sort !== 'version' || typeof key !== 'number' || !Number.isFinite(key))) return null;
    return { createdAt: date === null ? null : new Date(date), _id: new mongoose.Types.ObjectId(id), libraryVersionSortKey: key };
  } catch {
    return null;
  }
}

/** The boundary survives closing or deleting the report that supplied it. */
export function afterReportCursor(cursor, sort) {
  const prefix = {};
  const choices = [];
  for (const [key, direction] of Object.entries(sortSpec(sort))) {
    const value = cursor[key];
    if (value === null) {
      if (direction === 1) choices.push({ ...prefix, [key]: { $ne: null } });
    } else {
      choices.push({ ...prefix, [key]: { [direction === 1 ? '$gt' : '$lt']: value } });
      if (key !== '_id' && direction === -1) choices.push({ ...prefix, [key]: null });
    }
    prefix[key] = value;
  }
  return { $or: choices };
}
