// בדיקת מסלול הייבוא האמיתי מול מסד ודיסק מדומים; ללא MongoDB או רשת בזמן ההרצה.
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// mock.module דורש דגל ב-Node 22. גם הרצת test:node הרגילה מפעילה את הבדיקות בפועל.
if (!process.execArgv.includes('--experimental-test-module-mocks')) {
  test('ייבוא עמוד: בדיקות עדכון מסד עם מודולים מדומים', (t) => {
    const env = { ...process.env };
    delete env.NODE_TEST_CONTEXT;
    const result = spawnSync(process.execPath,
      ['--experimental-test-module-mocks', '--disable-warning=MODULE_TYPELESS_PACKAGE_JSON', '--test', fileURLToPath(import.meta.url)],
      { encoding: 'utf8', timeout: 120000, env });
    assert.ifError(result.error);
    t.diagnostic(result.stdout.split('\n').filter((l) => /^# (tests|pass|fail|skipped) /.test(l)).join('; '));
    assert.equal(result.status, 0, result.stderr + result.stdout);
    assert.match(result.stdout, /# tests 12\r?\n/);
  });
} else {
  let stored;
  let files;
  let writes;
  let afterRead;
  const key = { slug: 'berakhot', dafKey: '002a' };
  const clone = (value) => structuredClone(value);
  const matches = (query) => stored && Object.entries(query).every(([k, v]) => stored[k] === v);
  const pages = {
    findOne(query, projection) {
      const found = matches(query) ? Object.fromEntries(Object.keys(projection).map((k) => [k, stored[k]])) : null;
      return { async lean() { afterRead?.(); return clone(found); } };
    },
    async updateOne(query, update, options = {}) {
      writes.push(clone({ query, update, options }));
      if (!matches(query)) {
        if (options.upsert && !stored) {
          stored = clone({ ...query, ...update.$setOnInsert });
          return { upsertedCount: 1, matchedCount: 0, modifiedCount: 0 };
        }
        return { upsertedCount: 0, matchedCount: 0, modifiedCount: 0 };
      }
      const before = JSON.stringify(stored);
      Object.assign(stored, clone(update.$set || {}));
      for (const [k, v] of Object.entries(update.$inc || {})) stored[k] = (stored[k] || 0) + v;
      return { upsertedCount: 0, matchedCount: 1, modifiedCount: JSON.stringify(stored) === before ? 0 : 1 };
    },
  };
  mock.module('fflate', { namedExports: { Unzip: class {}, UnzipInflate: class {}, UnzipPassThrough: class {} } });
  for (const model of ['TzuratUpload', 'TzuratBatch', 'TzuratItem']) {
    mock.module(new URL(`../../models/${model}.js`, import.meta.url), { defaultExport: {} });
  }
  mock.module(new URL('../../models/TzuratPage.js', import.meta.url), { defaultExport: pages });
  mock.module(new URL('./uploads.js', import.meta.url), { namedExports: { assemblePackage() {} } });
  const relPath = (slug, dafKey, side, ext) => `/uploads/tzurat-hadaf/${slug}/${dafKey}.${side}.${ext}`;
  mock.module(new URL('./storage.js', import.meta.url), {
    namedExports: {
      stagingDir() {}, imageRelPath: relPath, imageFsPath: (p) => p,
      async exists(p) { return files.has(p); },
      async copyIntoPlace(src, dest) {
        const source = src.replaceAll('\\', '/');
        assert.ok(files.has(source), `missing staged file ${src}`);
        files.set(dest, files.get(source));
      },
    },
  });
  const { importPage, ImportError } = await import('./importPackage.js');
  const oldOurs = { path: '/old/002a.ours.png', w: 100, h: 200 };
  const existing = (extra = {}) => ({ ...key, buildId: 'b1', status: 'open', round: 4, activeCount: 2, approvedCount: 1, ours: clone(oldOurs), ...extra });
  const record = (extra = {}) => ({
    dafKey: '002a', daf: 'ב.', order: 1, pdf: { file: 'ברכות.pdf', page: 11 },
    scan: { ext: 'png', w: 400, h: 600 }, ours: null, nonVilna: false, changed: false,
    model: { blocks: [] }, ...extra,
  });
  function setup(prev = existing(), buildId = 'b1') {
    stored = clone(prev); files = new Map(); writes = []; afterRead = null;
    files.set('/stage/002a.scan.png', 'new-scan');
    return {
      manifest: { ...key, masechet: 'ברכות', buildId }, staging: '/stage', images: new Set(['002a.scan.png']),
      summary: { images: 0, pages: { created: 0, updated: 0, reopened: 0 } },
    };
  }

  test('אותה בנייה ללא צילום: הצילום והמונים נשמרים והנתונים מתעדכנים במסד', async () => {
    const ctx = setup();
    await importPage(ctx, record({ order: 9 }));
    assert.deepEqual(stored.ours, oldOurs);
    assert.equal(stored.order, 9);
    assert.equal(stored.scan.w, 400);
    assert.equal(stored.round, 4);
    assert.equal(stored.activeCount, 2);
    assert.equal(stored.approvedCount, 1);
    assert.equal(stored.buildId, 'b1');
    assert.deepEqual(ctx.summary.pages, { created: 0, updated: 1, reopened: 0 });
    assert.ok(writes.every((w) => !Object.hasOwn(w.update.$set || {}, 'ours')));
  });

  test('אותה בנייה ללא צילום: retry אינו משנה צילום או סבב, גם עם changed', async () => {
    const ctx = setup();
    await importPage(ctx, record({ changed: true }));
    await importPage(ctx, record({ changed: true }));
    assert.deepEqual(stored.ours, oldOurs);
    assert.equal(stored.round, 4);
    assert.equal(ctx.summary.pages.updated, 2);
  });

  for (const extra of [{}, { changed: true }]) {
    test(`בנייה חדשה ללא צילום מנקה את השדה; changed=${!!extra.changed}`, async () => {
      const ctx = setup(existing(), 'b2');
      await importPage(ctx, record(extra));
      assert.equal(stored.ours, null);
      assert.equal(stored.buildId, 'b2');
      assert.equal(stored.round, extra.changed ? 5 : 4);
      assert.equal(ctx.summary.pages.reopened, extra.changed ? 1 : 0);
    });
  }

  test('עמוד סגור בבנייה חדשה ללא צילום: מתנקה בלי פתיחת סבב', async () => {
    const ctx = setup(existing({ status: 'closed' }), 'b2');
    await importPage(ctx, record({ changed: true }));
    assert.equal(stored.ours, null);
    assert.equal(stored.status, 'closed');
    assert.equal(stored.round, 4);
  });

  for (const buildId of ['b1', 'b2']) {
    test(`צילום חדש מחליף צילום קודם ואת מידותיו (${buildId})`, async () => {
      const ctx = setup(existing(), buildId);
      ctx.images.add('002a.ours.webp'); files.set('/stage/002a.ours.webp', 'new-ours');
      await importPage(ctx, record({ ours: { ext: 'webp', w: 800, h: 1200 } }));
      const dest = relPath('berakhot', '002a', 'ours', 'webp');
      assert.deepEqual(stored.ours, { path: dest, w: 800, h: 1200 });
      assert.equal(files.get(dest), 'new-ours');
      assert.equal(ctx.summary.images, 2);
    });
  }

  test('עמוד חדש ללא צילום נוצר עם ours:null', async () => {
    const ctx = setup(null);
    await importPage(ctx, record());
    assert.equal(stored.ours, null);
    assert.equal(stored.buildId, 'b1');
    assert.equal(ctx.summary.pages.created, 1);
  });

  test('היעדר צילום קודם נשאר null באותה בנייה', async () => {
    const ctx = setup(existing({ ours: null }));
    await importPage(ctx, record());
    assert.equal(stored.ours, null);
  });

  test('סריקה חסרה עדיין חוסמת את הייבוא בלי עדכון מסד', async () => {
    const ctx = setup(); ctx.images.clear(); files.clear();
    const before = clone(stored);
    await assert.rejects(importPage(ctx, record()), ImportError);
    assert.deepEqual(stored, before);
    assert.equal(writes.length, 0);
  });

  test('הפניה לצילום שלא נמצא אינה נחשבת לחבילה בלי צילום', async () => {
    const ctx = setup();
    await importPage(ctx, record({ ours: { ext: 'webp', w: 800, h: 1200 } }));
    assert.equal(stored.ours, null);
  });

  test('הבנייה השתנתה בין קריאה לעדכון: אין שימור צילום מבנייה זרה', async () => {
    const ctx = setup();
    afterRead = () => { stored.buildId = 'concurrent-build'; };
    await importPage(ctx, record());
    assert.equal(stored.ours, null);
    assert.equal(stored.buildId, 'b1');
  });
}
