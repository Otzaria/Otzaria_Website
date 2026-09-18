/**
 * בדיקות אינטגרציה של מתגי המערכת במסך הניהול: הרשאה, שמירה ב-SystemConfig,
 * והשפעתם על ההגדרות בזמן ריצה. הרצה: npm test
 */
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import User from '../../models/User.js';
import SystemConfig from '../../models/SystemConfig.js';
import { setSettings } from './admin.js';
import { loadRuntimeFlags, loadCorrectionsConfig, RUNTIME_KEY } from './runtime.js';
import { startMongo } from './testing/mongo.js';

let db;
before(async () => { db = await startMongo(); });
after(async () => { if (!db.skip) await db.stop(); });

let users;
beforeEach(async () => {
  if (db.skip) return;
  await db.reset();
  users = {
    admin: await User.create({ name: 'מנהל', email: 'admin@example.org', password: 'x', role: 'admin' }),
    books: await User.create({ name: 'מנהל ספרים', email: 'books@example.org', password: 'x', role: 'admin_books' }),
    volunteer: await User.create({ name: 'מתנדב', email: 'v@example.org', password: 'x', isCorrectionsVolunteer: true }),
  };
});

test('ברירות המחדל כשאין מסמך: קליטה פעילה, פרסום כבוי, בלי פרסום אוטומטי', async (t) => {
  if (db.skip) return t.skip(db.skip);
  assert.deepEqual(await loadRuntimeFlags(), { verifyPaused: false, intakeEnabled: true, publishMode: 'disabled', autoPublish: false });
});

test('רק מנהל כללי משנה מתגים; מתנדב ומנהל ספרים נחסמים ולא כותבים כלום', async (t) => {
  if (db.skip) return t.skip(db.skip);
  for (const u of [users.volunteer, users.books]) {
    assert.equal((await setSettings({ user: u, patch: { intakeEnabled: false } })).status, 403);
  }
  assert.equal(await SystemConfig.countDocuments({ key: RUNTIME_KEY }), 0);
  assert.equal((await setSettings({ user: users.admin, patch: { intakeEnabled: false } })).status, 200);
  assert.equal((await loadRuntimeFlags()).intakeEnabled, false);
});

test('עדכון חלקי נשמר בלי לדרוס מתגים אחרים, ומתועד מי שינה', async (t) => {
  if (db.skip) return t.skip(db.skip);
  await setSettings({ user: users.admin, patch: { publishMode: 'pr', autoPublish: true, confirm: true } });
  await setSettings({ user: users.admin, patch: { verifyPaused: true } });
  assert.deepEqual(await loadRuntimeFlags(), { verifyPaused: true, intakeEnabled: true, publishMode: 'pr', autoPublish: true });
  const doc = await SystemConfig.findOne({ key: RUNTIME_KEY }).lean();
  assert.equal(String(doc.lastUpdatedBy), String(users.admin._id));
});

test("מצב 'direct' נשמר ונאכף מה-runtime; מצב לא מוכר נדחה בלי לשנות דבר", async (t) => {
  if (db.skip) return t.skip(db.skip);
  process.env.DICTA_LIBRARY_GITHUB_TOKEN = 'tok';
  try {
    const noConfirm = await setSettings({ user: users.admin, patch: { publishMode: 'direct' } });
    assert.equal(noConfirm.status, 400);
    assert.equal(noConfirm.body.error, 'confirmation_required');
    assert.notEqual((await loadRuntimeFlags()).publishMode, 'direct');
    assert.equal((await setSettings({ user: users.admin, patch: { publishMode: 'direct', confirm: true } })).status, 200);
    assert.equal((await loadRuntimeFlags()).publishMode, 'direct');
    const cfg = await loadCorrectionsConfig();
    assert.equal(cfg.publish.mode, 'direct');
    assert.equal(cfg.publish.disabledReason, null);
    const bad = await setSettings({ user: users.admin, patch: { publishMode: 'force-push' } });
    assert.equal(bad.status, 400);
    assert.equal(bad.body.error, 'invalid_publish_mode');
    assert.equal((await loadRuntimeFlags()).publishMode, 'direct');
    assert.equal((await setSettings({ user: users.admin, patch: { intakeEnabled: 'yes' } })).status, 400);
    assert.equal((await setSettings({ user: users.admin, patch: {} })).status, 400);
  } finally {
    delete process.env.DICTA_LIBRARY_GITHUB_TOKEN;
  }
});

test('פרסום אוטומטי מחייב אישור בגוף הבקשה; כיבוי אינו מחייב', async (t) => {
  if (db.skip) return t.skip(db.skip);
  const denied = await setSettings({ user: users.admin, patch: { autoPublish: true } });
  assert.equal(denied.status, 400);
  assert.equal(denied.body.error, 'confirmation_required');
  assert.equal((await loadRuntimeFlags()).autoPublish, false);
  assert.equal((await setSettings({ user: users.admin, patch: { autoPublish: true, confirm: true } })).status, 200);
  assert.equal((await loadRuntimeFlags()).autoPublish, true);
  assert.equal((await setSettings({ user: users.admin, patch: { autoPublish: false } })).status, 200);
  assert.equal((await loadRuntimeFlags()).autoPublish, false);
});

test('ערך פגום במסמך מתוקן לברירות מחדל בטוחות', async (t) => {
  if (db.skip) return t.skip(db.skip);
  await SystemConfig.create({ key: RUNTIME_KEY, value: { publishMode: 'direct ', intakeEnabled: 'no', autoPublish: 1 } });
  assert.deepEqual(await loadRuntimeFlags(), { verifyPaused: false, intakeEnabled: true, publishMode: 'disabled', autoPublish: false });
});
