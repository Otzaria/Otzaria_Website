#!/usr/bin/env node
/**
 * הערכה מחדש של דיווחי תיקונים שהועברו לידני כי ה-PR שלהם נסגר בלי מיזוג (מנהל הספרייה סוגר PR
 * אחרי שהחיל אותו בקומיט מקומי). אותו כלל כמו מעקב ה-PR ב-worker: התיקון ב-main (בשורה המעוגנת) →
 * נסגר כפורסם; אחרת ממתין לקליטה עד PR_ABSORPTION_GRACE_SECONDS מרגע זיהוי הסגירה, ואז לידני;
 * תווית דחייה על ה-PR → ידני מיד. אידמפוטנטית; ברירת מחדל: dry-run. GitHub: קריאה בלבד, כל קובץ פעם אחת.
 *
 * הרצה (בתיקיית האתר):
 *   node scripts/migrate-corrections-closed-prs.mjs [--apply] [--out <file.jsonl>]
 *   node scripts/migrate-corrections-closed-prs.mjs --revert [--apply]     # ביטול: חזרה למצב שלפני ה-migration
 * --out: שורת JSON לכל דיווח (מזהה, PR, נתיב, שורה, תוצאה, פעולה) — בלי פרטים אישיים.
 * קוד יציאה 1 כשהיו שגיאות (הרצה חוזרת משלימה אותן).
 * env (מ-.env): MONGODB_URI, וטוקן ה-GitHub של האתר (GITHUB_APP_* או DICTA_LIBRARY_GITHUB_TOKEN).
 */
import { writeFileSync } from 'node:fs';
import mongoose from 'mongoose';
import { migrateClosedPullReports, revertClosedPullMigration } from '../src/lib/corrections/migrate.js';
import { loadCorrectionsConfig } from '../src/lib/corrections/runtime.js';

try { (await import('dotenv')).config({ quiet: true }); } catch { /* dotenv אופציונלי */ }
const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/otzaria_db';
const args = process.argv.slice(2);
const apply = args.includes('--apply');
const revert = args.includes('--revert');
const outIdx = args.indexOf('--out');
const outFile = outIdx !== -1 ? args[outIdx + 1] : null;
if (outIdx !== -1 && !outFile) {
  console.error('--out דורש נתיב קובץ');
  process.exit(2);
}
let githubRequests = 0;
const githubFetch = (...a) => {
  githubRequests += 1;
  return fetch(...a);
};

await mongoose.connect(uri, { serverSelectionTimeoutMS: 10_000 });
let exitCode = 0;
try {
  if (revert) {
    console.log(JSON.stringify(await revertClosedPullMigration({ apply }), null, 2));
  } else {
    const config = await loadCorrectionsConfig();
    if (!config.source.token) console.warn('אזהרה: אין טוקן GitHub — הקריאות מוגבלות ל-60 בשעה.');
    // דיווח בהמתנה נבדק רק במעקב ה-PR, שאינו רץ כשהפרסום כבוי — לכן במצב הזה אין העברה להמתנה.
    if (config.publish.mode === 'disabled') console.warn('אזהרה: מצב הפרסום כבוי — דיווחים שהיו עוברים להמתנה נשארים בתור הידני (skipped.awaitPublishDisabled).');
    const rows = outFile ? [] : null;
    const res = await migrateClosedPullReports({ config, deps: { githubFetch }, apply, rows });
    if (rows) writeFileSync(outFile, rows.map((r) => JSON.stringify(r)).join('\n') + (rows.length ? '\n' : ''));
    console.log(JSON.stringify({ ...res, githubRequests }, null, 2));
    if (res.errors > 0) {
      console.error(`${res.errors} דיווחים לא נבדקו בגלל שגיאות — יש להריץ שוב.`);
      exitCode = 1;
    }
  }
  if (!apply) console.log('dry-run בלבד. להחלה: --apply');
} finally {
  await mongoose.disconnect();
}
process.exit(exitCode);
