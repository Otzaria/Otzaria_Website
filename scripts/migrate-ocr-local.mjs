#!/usr/bin/env node
/**
 * מיגרציה לספק OCR המקומי (method=local): שדה active ב-OcrJob והחלפת האינדקס הייחודי
 * החלקי { book:1 } partial { status:'running' } ב-book_active_unique (partial { active:true }),
 * ויצירת requestId_unique ואינדקסי הרשימה/הניקוי, וגם אינדקסי OcrPageResult (נתוני פריסה/עזר לכל
 * עמוד). אידמפוטנטית ולא הרסנית.
 *
 * הרצה: node scripts/migrate-ocr-local.mjs [--apply] [--fail-older-duplicates]   (MONGODB_URI מ-.env)
 *   ברירת מחדל: dry-run — מדפיס JSON של מה ייעשה ולא משנה דבר.
 *   --apply                  מבצע בפועל.
 *   --fail-older-duplicates  אם יש ספר עם יותר מעבודה פעילה אחת: מסמן את הישנות failed
 *                            (בלי זה — עוצר עם דוח ולא נוגע בכלום).
 * סדר פריסה: פריסה ומיד אחריה --apply. עד אז activeFilter() סובלני לרשומות בלי active.
 */
import mongoose from 'mongoose';
import { migrateOcrLocal } from '../src/lib/ocr/ocrJobMigration.js';

try { (await import('dotenv')).config(); } catch { /* dotenv אופציונלי */ }
const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/otzaria_db';
const apply = process.argv.includes('--apply');
const failOlder = process.argv.includes('--fail-older-duplicates');

// בלי autoIndex: האינדקסים נוצרים כאן במפורש ובסדר הנכון (קודם מחיקת הישן)
await mongoose.connect(uri, { serverSelectionTimeoutMS: 10_000, autoIndex: false });
try {
  const res = await migrateOcrLocal({ apply, failOlder });
  console.log(JSON.stringify(res, null, 2));
  if (!res.ok) {
    process.exitCode = 1;
  } else if (!apply) {
    console.log(res.changes ? 'dry-run בלבד. להחלה: --apply' : 'dry-run: אין שינויים לביצוע');
  } else if (!res.changes) {
    console.log('אין שינויים — המיגרציה כבר הוחלה');
  }
} finally {
  await mongoose.disconnect();
}
