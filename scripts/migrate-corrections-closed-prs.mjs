#!/usr/bin/env node
/**
 * הערכה מחדש של דיווחי תיקונים שהועברו לידני כי ה-PR שלהם נסגר בלי מיזוג (מנהל הספרייה סוגר PR
 * אחרי שהחיל אותו בקומיט מקומי). אותו כלל כמו מעקב ה-PR ב-worker: התיקון ב-main → נסגר כפורסם;
 * המקור עדיין שם → ממתין לקליטה (עד PR_ABSORPTION_GRACE_SECONDS מרגע זיהוי הסגירה); אחרת → נשאר ידני.
 * אידמפוטנטית; ברירת מחדל: dry-run. GitHub: קריאה בלבד, כל קובץ פעם אחת.
 * הרצה (בתיקיית האתר): node scripts/migrate-corrections-closed-prs.mjs [--apply]
 * env (מ-.env): MONGODB_URI, וטוקן ה-GitHub של האתר (GITHUB_APP_* או DICTA_LIBRARY_GITHUB_TOKEN).
 */
import mongoose from 'mongoose';
import { migrateClosedPullReports } from '../src/lib/corrections/migrate.js';
import { loadCorrectionsConfig } from '../src/lib/corrections/runtime.js';

try { (await import('dotenv')).config({ quiet: true }); } catch { /* dotenv אופציונלי */ }
const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/otzaria_db';
const apply = process.argv.includes('--apply');
let githubRequests = 0;
const githubFetch = (...args) => {
  githubRequests += 1;
  return fetch(...args);
};

await mongoose.connect(uri, { serverSelectionTimeoutMS: 10_000 });
try {
  const config = await loadCorrectionsConfig();
  if (!config.source.token) console.warn('אזהרה: אין טוקן GitHub — הקריאות מוגבלות ל-60 בשעה.');
  // דיווחים שיעברו להמתנה נבדקים במעקב ה-PR של ה-worker, שאינו רץ כשהפרסום כבוי.
  if (config.publish.mode === 'disabled') console.warn('אזהרה: מצב הפרסום כבוי — דיווחים שממתינים לקליטה לא ייבדקו עד שיופעל.');
  const res = await migrateClosedPullReports({ config, deps: { githubFetch }, apply });
  console.log(JSON.stringify({ ...res, githubRequests }, null, 2));
  if (!apply) console.log('dry-run בלבד. להחלה: --apply');
} finally {
  await mongoose.disconnect();
}
