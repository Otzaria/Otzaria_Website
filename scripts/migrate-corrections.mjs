#!/usr/bin/env node
/**
 * migration של מערכת תיקוני הטקסט (אידמפוטנטית, תואמת-לאחור). ברירת מחדל: dry-run.
 * הרצה: node scripts/migrate-corrections.mjs [--apply]     (MONGODB_URI מ-.env)
 * rollback: אין צורך במחיקה — ראו docs/text-corrections/OPERATIONS.md.
 */
import mongoose from 'mongoose';
import { migrateLegacyReports } from '../src/lib/corrections/migrate.js';

try { (await import('dotenv')).config(); } catch { /* dotenv אופציונלי */ }
const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/otzaria_db';
const apply = process.argv.includes('--apply');

await mongoose.connect(uri, { serverSelectionTimeoutMS: 10_000 });
try {
  const res = await migrateLegacyReports({ apply });
  console.log(JSON.stringify(res, null, 2));
  if (!apply) console.log('dry-run בלבד. להחלה: --apply');
} finally {
  await mongoose.disconnect();
}
