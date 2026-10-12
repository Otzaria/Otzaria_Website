/**
 * בדיקות רישום המוצרים: ולידציה, טביעת התוכן (זהה לאוצריא), טקסטים לפי מוצר. הרצה: npm test
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PRODUCTS, PRODUCT_KEYS, DEFAULT_PRODUCT, isProductKey, productOf, getProduct, productFilter, productByRepo,
} from './products.js';
import { validateAppReport } from './validation.js';
import { computeContentHash } from './hashes.js';
import { buildIssueTitle, buildIssueBody, buildMergeComment, issueLabels } from './issue-text.js';
import { closureText, CLOSURE_TEXT_HE, CLOSURE_KINDS } from './state-change.js';
import { appReportMailBranding } from './mail-text.js';
import { DEFAULT_REPO, getAppReportsConfig } from './config.js';

const manual = (over = {}) => ({
  schema: 1, reportId: '6f1c1f0e-8a43-4d1f-9b7e-1f0b7c7f0a11', type: 'bug', trigger: 'manual',
  title: 'החיפוש לא עובד', description: 'לחצתי על חיפוש ולא קרה כלום', stepsToReproduce: '1. פתח\n2. חפש',
  reporterEmail: 'User@Example.com', appVersion: '0.9.98', platform: 'windows', osVersion: '10.0.26200', arch: 'x64',
  createdAt: '2026-09-17T10:00:00.000Z',
  ...over,
});
const crash = (over = {}) => manual({
  type: 'crash', trigger: 'auto_crash', title: 'קריסה: StateError', description: '', stepsToReproduce: undefined, reporterEmail: '',
  signature: { exceptionType: 'StateError', frames: ['package:otzaria/a.dart in foo', 'package:otzaria/b.dart in bar'] },
  ...over,
});

// חושבו בנוסחה שלפני הוספת המוצרים (origin/master 603b61a4). שינוי כאן = דיווח ישן שנשלח שוב יקבל 409.
const GOLDEN_MANUAL_HASH = 'dc95fbd5dcda072fb10a8ea6f6c60107d2dbbcea9858089b34af764c55ae547d';
const GOLDEN_CRASH_HASH = '0b986efc723495f2c5ad12e8c7db7fd82e179558ae17595b8f9c8b05358ab1be';

const value = async (raw) => {
  const r = await validateAppReport(raw);
  assert.equal(r.ok, true, JSON.stringify(r));
  return r.value;
};

// ---------------------------------------------------------------- registry

test('רישום: שני מוצרים, ריפו ושם מוצג לכל אחד', () => {
  assert.deepEqual(PRODUCT_KEYS, ['otzaria', 'offline-update']);
  assert.equal(DEFAULT_PRODUCT, 'otzaria');
  assert.deepEqual(PRODUCTS.otzaria, { key: 'otzaria', repo: 'Otzaria/otzaria', displayName: 'אוצריא' });
  assert.deepEqual(PRODUCTS['offline-update'], { key: 'offline-update', repo: 'Otzaria/Otzaria_Offline_update', displayName: 'עדכוני אוצריא' });
  assert.ok(Object.isFrozen(PRODUCTS) && Object.isFrozen(PRODUCTS.otzaria));
  assert.equal(DEFAULT_REPO, 'Otzaria/otzaria');
});

test('isProductKey: רק מפתחות רשומים — לא מאפייני prototype ולא רישיות אחרת', () => {
  for (const k of PRODUCT_KEYS) assert.equal(isProductKey(k), true);
  for (const k of ['constructor', '__proto__', 'toString', 'hasOwnProperty', 'Otzaria', 'OFFLINE-UPDATE', '', ' otzaria', null, undefined, 5, {}, []]) {
    assert.equal(isProductKey(k), false, String(k));
  }
});

test('productOf / getProduct: מסמך ישן בלי השדה (או ערך לא מוכר) הוא אוצריא', () => {
  assert.equal(productOf({}), 'otzaria');
  assert.equal(productOf({ product: null }), 'otzaria');
  assert.equal(productOf(null), 'otzaria');
  assert.equal(productOf({ product: 'constructor' }), 'otzaria');
  assert.equal(productOf({ product: 'offline-update' }), 'offline-update');
  assert.equal(getProduct(undefined).repo, 'Otzaria/otzaria');
  assert.equal(getProduct('offline-update').repo, 'Otzaria/Otzaria_Offline_update');
  assert.equal(getProduct('constructor').repo, 'Otzaria/otzaria');
});

test('productFilter: אוצריא כולל מסמכים בלי השדה; מוצר אחר — התאמה מדויקת', () => {
  assert.deepEqual(productFilter('otzaria'), { product: { $in: [null, 'otzaria'] } });
  assert.deepEqual(productFilter(undefined), { product: { $in: [null, 'otzaria'] } });
  assert.deepEqual(productFilter('offline-update'), { product: 'offline-update' });
});

test('productByRepo: בלי תלות ברישיות; ריפו לא מוכר → null', () => {
  assert.equal(productByRepo('Otzaria/otzaria'), 'otzaria');
  assert.equal(productByRepo('otzaria/OTZARIA'), 'otzaria');
  assert.equal(productByRepo('Otzaria/Otzaria_Offline_update'), 'offline-update');
  assert.equal(productByRepo('otzaria/otzaria_offline_update'), 'offline-update');
  assert.equal(productByRepo('evil/repo'), null);
  assert.equal(productByRepo('Otzaria/otzaria-fork'), null);
  assert.equal(productByRepo(undefined), null);
  assert.equal(productByRepo({ toLowerCase: () => 'otzaria/otzaria' }), null);
});

test('config: הריפו קבוע בקוד גם כשיש משתנה סביבה', () => {
  assert.equal(getAppReportsConfig({ APP_REPORTS_GITHUB_REPO: 'other/repo' }).repo, 'Otzaria/otzaria');
});

// ---------------------------------------------------------------- validation

test('ולידציה: product חסר, null או "otzaria" → אוצריא; "offline-update" מתקבל', async () => {
  assert.equal((await value(manual())).product, 'otzaria');
  assert.equal((await value(manual({ product: null }))).product, 'otzaria');
  assert.equal((await value(manual({ product: 'otzaria' }))).product, 'otzaria');
  assert.equal((await value(manual({ product: 'offline-update' }))).product, 'offline-update');
});

test('ולידציה: כל ערך אחר של product → 422 "product: unknown"', async () => {
  for (const product of ['', 'Otzaria', 'offline_update', 'constructor', '__proto__', 5, true, {}, [], ['otzaria']]) {
    const r = await validateAppReport(manual({ product }));
    assert.deepEqual(
      { ok: r.ok, status: r.status, field: r.field, error: r.error },
      { ok: false, status: 422, field: 'product', error: 'product: unknown' },
      JSON.stringify(product),
    );
  }
});

// ---------------------------------------------------------------- hashes

test('contentHash של אוצריא זהה לנוסחה הקודמת (golden) — עם product ובלעדיו', async () => {
  for (const over of [{}, { product: null }, { product: 'otzaria' }]) {
    assert.equal(computeContentHash(await value(manual(over))), GOLDEN_MANUAL_HASH);
    assert.equal(computeContentHash(await value(crash(over))), GOLDEN_CRASH_HASH);
  }
  // מסמך ישן בלי השדה (כמו שנשמר לפני השינוי)
  const { product, ...legacy } = await value(manual());
  assert.equal(product, 'otzaria');
  assert.equal(computeContentHash(legacy), GOLDEN_MANUAL_HASH);
});

test('contentHash של מוצר אחר כולל את המוצר: אותו תוכן ≠ אוצריא, ויציב', async () => {
  const otz = computeContentHash(await value(manual()));
  const upd = computeContentHash(await value(manual({ product: 'offline-update' })));
  assert.notEqual(upd, otz);
  assert.match(upd, /^[0-9a-f]{64}$/);
  assert.equal(computeContentHash(await value(manual({ product: 'offline-update', reportId: 'x', attachments: undefined }))), upd);
  assert.notEqual(computeContentHash(await value(crash({ product: 'offline-update' }))), GOLDEN_CRASH_HASH);
});

// ---------------------------------------------------------------- issue text

test('טקסט ה-issue, התגובה והתוויות זהים בין המוצרים (אותו פורמט)', async () => {
  const otz = { ...(await value(crash())), signatureHash: 'abc' };
  const upd = { ...otz, product: 'offline-update' };
  assert.equal(buildIssueTitle(upd), buildIssueTitle(otz));
  assert.equal(buildIssueBody(upd, { previousIssueNumber: 3 }), buildIssueBody(otz, { previousIssueNumber: 3 }));
  assert.equal(buildMergeComment(upd), buildMergeComment(otz));
  assert.deepEqual(issueLabels(upd), ['from-app', 'crash', 'platform:windows', 'auto-report']);
});

// ---------------------------------------------------------------- mail texts

test('טקסט סגירה: אוצריא זהה מילה במילה לטקסט הקודם; עדכוני אוצריא בשמו', () => {
  const before = {
    completed: 'הבעיה שדיווחת עליה טופלה. התיקון ייכלל בגרסה הבאה של אוצריא (אם עוד לא נכלל).',
    not_planned: 'הדיווח נבדק, והוחלט שלא לטפל בו בשלב זה.',
    duplicate: 'הדיווח נסגר כי הבעיה כבר מטופלת בדיווח אחר.',
    other: 'הדיווח נסגר.',
  };
  assert.deepEqual({ ...CLOSURE_TEXT_HE }, before);
  for (const k of CLOSURE_KINDS) {
    assert.equal(closureText(k), before[k]);
    assert.equal(closureText(k, 'otzaria'), before[k]);
  }
  assert.equal(closureText('completed', 'offline-update'), 'הבעיה שדיווחת עליה טופלה. התיקון ייכלל בגרסה הבאה של עדכוני אוצריא (אם עוד לא נכלל).');
  assert.equal(closureText('not_planned', 'offline-update'), before.not_planned);
});

test('מיתוג המיילים: אוצריא כמו קודם; עדכוני אוצריא בשמו', () => {
  const otz = { brandName: 'אוצריא', fromName: 'אוצריא', teamName: 'צוות אוצריא', thanksLine: 'תודה שעזרת לשפר את אוצריא!' };
  assert.deepEqual(appReportMailBranding(undefined), otz);
  assert.deepEqual(appReportMailBranding('otzaria'), otz);
  assert.deepEqual(appReportMailBranding('offline-update'), {
    brandName: 'עדכוני אוצריא', fromName: 'עדכוני אוצריא', teamName: 'צוות עדכוני אוצריא', thanksLine: 'תודה שעזרת לשפר את עדכוני אוצריא!',
  });
});
