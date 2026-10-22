// אינדקסי סכמת OcrJob מול TARGET_INDEXES של המיגרציה — בלי DB. אינדקס שנוסף לסכמה בלי
// להוסיף אותו למיגרציה (או להפך) נכשל כאן, כדי שהסקריפט scripts/migrate-ocr-local.mjs ייצור
// בדיוק את מה שהקוד מצפה לו.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import OcrJob from '../../models/OcrJob.js';
import OcrPageResult from '../../models/OcrPageResult.js';
import { PAGE_RESULT_INDEXES, TARGET_INDEXES, defaultIndexName, planIndexChanges } from './ocrJobMigration.js';

// אינדקסים שקדמו לספק local ונוצרים ע"י Mongoose כרגיל — המיגרציה לא אחראית עליהם
const PRE_EXISTING = new Set(['status_1', 'book_1_createdAt_-1']);

const normalize = (key, options = {}) => ({
  name: options.name || defaultIndexName(key),
  key: JSON.stringify(key),
  unique: options.unique === true,
  partialFilterExpression: options.partialFilterExpression ? JSON.stringify(options.partialFilterExpression) : null,
});

const byName = (a, b) => a.name.localeCompare(b.name);

test('TARGET_INDEXES זהה בדיוק לאינדקסי הסכמה (מלבד הוותיקים) — מפתח, שם, unique ו-partial', () => {
  const fromSchema = OcrJob.schema
    .indexes()
    .map(([key, options]) => normalize(key, options))
    .filter((i) => !PRE_EXISTING.has(i.name))
    .sort(byName);
  const fromMigration = TARGET_INDEXES.map(({ key, options }) => normalize(key, options)).sort(byName);
  assert.deepEqual(fromMigration, fromSchema);
});

test('האינדקסים הוותיקים עדיין בסכמה (אחרת יש לעדכן את PRE_EXISTING כאן)', () => {
  const names = OcrJob.schema.indexes().map(([key, options]) => options?.name || defaultIndexName(key));
  for (const name of PRE_EXISTING) assert.ok(names.includes(name), name);
});

test('planIndexChanges: אחרי יצירת כל TARGET_INDEXES אין מה ליצור', () => {
  const existing = TARGET_INDEXES.map(({ key, options }) => ({ key, name: options.name || defaultIndexName(key) }));
  assert.deepEqual(planIndexChanges(existing), { toDrop: [], toCreate: [] });
});

test('PAGE_RESULT_INDEXES זהה בדיוק לאינדקסי הסכמה של OcrPageResult', () => {
  const fromSchema = OcrPageResult.schema.indexes().map(([key, options]) => normalize(key, options)).sort(byName);
  const fromMigration = PAGE_RESULT_INDEXES.map(({ key, options }) => normalize(key, options)).sort(byName);
  assert.deepEqual(fromMigration, fromSchema);
});
