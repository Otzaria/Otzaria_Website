import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  buildCompanionMeta,
  companionFromDoc,
  emptyCompanion,
  findExecutableEntries,
  normalizeCompanionPlatform,
  serializeCompanionForPublic,
} from './pluginCompanion.js';

const MAX = 150 * 1024 * 1024;

// עוזר: הקלט המינימלי התקין, שממנו כל בדיקה משנה שדה אחד
function validInput(overrides = {}) {
  return {
    fileName: 'chavruta-setup-6.0.0.exe',
    size: 8_400_000,
    sha256: 'ab'.repeat(32),
    platform: 'windows',
    name: 'מתאם חברותא',
    version: '6.0.0',
    installsPlugin: true,
    maxBytes: MAX,
    ...overrides,
  };
}

// ==================== זיהוי קובץ הרצה בתוך החבילה ====================

test('חבילה של קבצי web בלבד — אין ממצא', () => {
  const entries = [
    { name: 'manifest.json', size: 900 },
    { name: 'index.html', size: 12071 },
    { name: 'js/app.js', size: 40000 },
    { name: 'icon/icon.png', size: 10781 },
  ];
  assert.deepEqual(findExecutableEntries(entries), []);
});

test('קובץ הרצה מזוהה גם באות גדולה ובתוך תיקייה', () => {
  const entries = [
    { name: 'js/app.js' },
    { name: 'bin/setup.EXE' },
    { name: 'native/lib.dll' },
    { name: 'tools/run.sh' },
  ];
  assert.deepEqual(findExecutableEntries(entries), ['bin/setup.EXE', 'native/lib.dll', 'tools/run.sh']);
});

test('מקבל גם מערך של שמות, ולא רק רשומות', () => {
  assert.deepEqual(findExecutableEntries(['a.js', 'b.msi']), ['b.msi']);
  assert.deepEqual(findExecutableEntries(undefined), []);
});

// ==================== נירמול פלטפורמה ====================

test('פלטפורמה מנורמלת, וערך לא מוכר מוחזר null', () => {
  assert.equal(normalizeCompanionPlatform(' Windows '), 'windows');
  assert.equal(normalizeCompanionPlatform('macos'), 'macos');
  assert.equal(normalizeCompanionPlatform('freebsd'), null);
  assert.equal(normalizeCompanionPlatform(''), null);
});

// ==================== בניית המטא-דאטה ====================

test('קלט תקין — כל השדות נשמרים, והסיומת נגזרת מהשם', () => {
  const meta = buildCompanionMeta(validInput());
  assert.equal(meta.present, true);
  assert.equal(meta.ext, '.exe');
  assert.equal(meta.fileName, 'chavruta-setup-6.0.0.exe');
  assert.equal(meta.platform, 'windows');
  assert.equal(meta.installsPlugin, true);
  assert.equal(meta.size, 8_400_000);
  assert.equal(meta.sha256, 'ab'.repeat(32));
});

test('שם הקובץ מנוקה מנתיב — לא נשמר נתיב שהלקוח שלח', () => {
  const meta = buildCompanionMeta(validInput({ fileName: '../../etc/setup.exe' }));
  assert.equal(meta.fileName, 'setup.exe');
});

test('גרסה ריקה מותרת; installsPlugin ברירת מחדל כבוי', () => {
  const meta = buildCompanionMeta(validInput({ version: '', installsPlugin: undefined }));
  assert.equal(meta.version, '');
  assert.equal(meta.installsPlugin, false);
});

test('סיומת שאינה של הפלטפורמה נדחית', () => {
  assert.throws(() => buildCompanionMeta(validInput({ platform: 'macos' })), /אינה מתאימה ל-macOS/);
  assert.throws(() => buildCompanionMeta(validInput({ fileName: 'setup.dmg' })), /אינה מתאימה ל-Windows/);
  assert.throws(() => buildCompanionMeta(validInput({ fileName: 'setup' })), /ללא סיומת/);
});

test('פלטפורמה, שם, קובץ ריק, גרסה וגודל — כולם נדחים', () => {
  assert.throws(() => buildCompanionMeta(validInput({ platform: 'freebsd' })), /מערכת ההפעלה/);
  assert.throws(() => buildCompanionMeta(validInput({ name: '   ' })), /שם התוכנה הנלווית/);
  assert.throws(() => buildCompanionMeta(validInput({ name: 'א'.repeat(61) })), /60 תווים/);
  assert.throws(() => buildCompanionMeta(validInput({ size: 0 })), /ריק/);
  assert.throws(() => buildCompanionMeta(validInput({ version: 'גרסה א' })), /גרסת התוכנה/);
  assert.throws(() => buildCompanionMeta(validInput({ size: MAX + 1 })), /חורג מהמגבלה/);
});

// ==================== ייצוג ציבורי ====================

test('תוסף בלי תוכנה נלווית מיוצג כ-null', () => {
  assert.equal(serializeCompanionForPublic(emptyCompanion(), { downloadUrl: '/x' }), null);
  assert.equal(serializeCompanionForPublic(null, { downloadUrl: '/x' }), null);
  assert.equal(companionFromDoc(emptyCompanion()), null);
});

test('הייצוג הציבורי נושא תווית פלטפורמה וקישור הורדה, ואינו נושא את הסיומת הפנימית', () => {
  const pub = serializeCompanionForPublic(buildCompanionMeta(validInput()), {
    downloadUrl: '/api/plugins/abc/companion',
  });
  assert.equal(pub.platformLabel, 'Windows');
  assert.equal(pub.downloadUrl, '/api/plugins/abc/companion');
  assert.equal(pub.sha256, 'ab'.repeat(32));
  assert.equal(pub.ext, undefined);
});
