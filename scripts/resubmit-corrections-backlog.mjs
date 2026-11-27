#!/usr/bin/env node
/**
 * שליחה מחודשת לשירות הבדיקה (מצב משיכה) של דיווחים שממתינים בתור הידני של המתנדבים מלפני שהשירות הופעל: דיווח
 * כזה אינו חוזר לשירות מעצמו, ו"שליחה מחודשת לשירות" במסך דורשת מתנדב שמחזיק בו. נבחרים דיווחים פתוחים ופנויים
 * (בתור או ששוחררו, בלי מטפל), שלא אושרו, שאינם בדרך לשירות או בפרסום (כולל PR שנסגר / ממתין לקליטה), ושיש להם
 * הצעה של שורה אחת. לכל אחד — אותו מעבר בדיוק כמו בפעולת המתנדב, מותנה ב-generation שנקרא ובכל תנאי הבחירה.
 * ברירת מחדל: dry-run. הלוגיקה והבדיקות: src/lib/corrections/resubmit-backlog.js (+ .int.test.mjs).
 *
 * הרצה (בתיקיית האתר):
 *   node scripts/resubmit-corrections-backlog.mjs [--reason <manual.handoffReason>]... [--limit N]     # dry-run
 *   node scripts/resubmit-corrections-backlog.mjs --apply [--reason ...]... [--limit N] [--log <file.jsonl>]
 * --log: שורת JSON לכל דיווח שנשלח (מזהה, generation לפני ואחרי, סיבת ההעברה, request_id), נוספת לסוף הקובץ.
 * קודי יציאה: 0 הצלחה; 1 שגיאות בכתיבה (הרצה חוזרת משלימה); 2 ארגומנטים שגויים; 3 סירוב — שבת/יו"ט (גם ב-dry-run),
 * או --apply כששירות הבדיקה כבוי/מושהה או אינו במצב משיכה. אינו מריץ אצווה: תפיסת השירות יוצרת את המשימות מה-outbox.
 * env (מ-.env): MONGODB_URI ומשתני שירות הבדיקה של האתר (CORRECTIONS_VERIFY_*, CORRECTIONS_AGENT_*).
 */
import mongoose from 'mongoose';
import { runResubmitBacklogCli } from '../src/lib/corrections/resubmit-backlog.js';

try { (await import('dotenv')).config({ quiet: true }); } catch { /* dotenv אופציונלי */ }
const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/otzaria_db';

const code = await runResubmitBacklogCli(process.argv.slice(2), {
  connect: () => mongoose.connect(uri, { serverSelectionTimeoutMS: 10_000 }),
  disconnect: () => mongoose.disconnect(),
});
process.exit(code);
