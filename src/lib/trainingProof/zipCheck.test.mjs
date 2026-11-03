/**
 * בדיקת קובץ ZIP מהתחנה (חוזה tp/1, docs/76 §2–§4): manifest, פריטים לכל חלק,
 * תמונות חסרות, חלק לא נכון (ה-12), מונים, ו-zipSync/unzipSync אמיתיים.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { zipSync, unzipSync } from 'fflate';
import { checkToSiteZip, checkManifest, checkZipSize, checkBooks } from './zipCheck.js';
import { sampleEntries, ocrItem, routerItem, framesItem, manifestOf } from './testFixtures.js';
import { itemDoc, storageRel } from './storage.js';
import { unzipTrainingZip } from './zipArchive.js';

test('קובץ תקין בכל אחד משלושת החלקים — עובר, כולל דרך ZIP אמיתי', () => {
  for (const section of ['ocr', 'router', 'frames']) {
    const entries = unzipSync(zipSync(sampleEntries(section, { n: 4 })));
    const r = checkToSiteZip(entries);
    assert.deepEqual(r.errors, [], section);
    assert.equal(r.ok, true);
    assert.equal(r.section, section);
    assert.equal(r.items.length, 4);
    if (section === 'frames') assert.equal(r.books.size, 1);
  }
});

test('תיקייה אחת שעוטפת הכול — נתמכת', () => {
  const r = checkToSiteZip(sampleEntries('ocr', { prefix: 'export-1/' }));
  assert.equal(r.ok, true);
  assert.equal(r.base, 'export-1/');
});

test('קובץ שהועלה לכרטיס של חלק אחר — נדחה בהודעה ברורה (ה-12)', () => {
  const r = checkToSiteZip(sampleEntries('router'), { expectSection: 'ocr' });
  assert.equal(r.ok, false);
  assert.match(r.errors[0], /נתב הכתב.*זיהוי טקסט/);
});

test('manifest: חוזה, כיוון, מזהים', () => {
  assert.equal(checkManifest(manifestOf('ocr', { counts: { items: 1 } })), null);
  assert.match(checkManifest(manifestOf('ocr', { contract: 'tp/2', counts: { items: 1 } })), /גרסת-חוזה/);
  assert.match(checkManifest(manifestOf('ocr', { direction: 'to-station', counts: { items: 1 } })), /קובץ-החזרה/);
  assert.match(checkManifest(manifestOf('ocr', { package_id: 'x', counts: { items: 1 } })), /package_id/);
  assert.match(checkManifest(manifestOf('ocr', { part: 3, parts: 2, counts: { items: 1 } })), /part/);
  assert.match(checkManifest(manifestOf('ocr', { station_id: 'st-1', counts: { items: 1 } })), /station_id/);
  assert.match(checkManifest(manifestOf('ocr', { counts: {} })), /counts/);
  assert.match(checkManifest(null), /JSON/);
});

test('בלי manifest / שמות לא-ASCII / items.jsonl חסר', () => {
  assert.match(checkToSiteZip({ 'a.txt': new Uint8Array(1) }).errors[0], /manifest/);
  const e = sampleEntries('ocr');
  e['img/שם.png'] = new Uint8Array(1);
  assert.match(checkToSiteZip(e).errors[0], /ASCII/);
  const e2 = sampleEntries('ocr');
  delete e2['items.jsonl'];
  assert.match(checkToSiteZip(e2).errors[0], /items\.jsonl/);
});

test('תמונה חסרה, uid של חלק אחר, sig לא תקין, uid כפול', () => {
  const missing = sampleEntries('ocr');
  delete missing['img/22711.png'];
  assert.match(checkToSiteZip(missing).errors.join(), /התמונה חסרה/);

  const wrongUid = sampleEntries('ocr', { items: [ocrItem(0, { uid: 'router:rlines:1' })] });
  assert.match(checkToSiteZip(wrongUid).errors.join(), /uid/);

  const badSig = sampleEntries('ocr', { items: [ocrItem(0, { sig: 'XYZ' })] });
  assert.match(checkToSiteZip(badSig).errors.join(), /sig/);

  const dup = sampleEntries('ocr', { items: [ocrItem(0), ocrItem(0)] });
  assert.match(checkToSiteZip(dup).errors.join(), /פעמיים/);
});

test('נתיב-תמונה שיוצא מהתיקייה — נדחה', () => {
  const r = checkToSiteZip(sampleEntries('ocr', { items: [ocrItem(0, { img: '../x.png' })] }));
  assert.match(r.errors.join(), /נתיב-תמונה/);
});

test('ocr: track/source חובה, conf בטווח, ctx עם תמונה ותיבה', () => {
  const noTrack = ocrItem(0);
  delete noTrack.track;
  assert.match(checkToSiteZip(sampleEntries('ocr', { items: [noTrack] })).errors.join(), /track/);
  assert.match(checkToSiteZip(sampleEntries('ocr', { items: [ocrItem(0, { source: 'x' })] })).errors.join(), /source/);
  assert.match(checkToSiteZip(sampleEntries('ocr', { items: [ocrItem(0, { conf: 140 })] })).errors.join(), /conf/);
  const ctx = { img: 'img/ctx-b-5e0c2a91d4-p17.png', bbox: [312, 904, 924, 942] };
  const okCtx = checkToSiteZip(sampleEntries('ocr', { items: [ocrItem(0, { ctx }), ocrItem(1, { ctx })] }));
  assert.equal(okCtx.ok, true);
  assert.equal(okCtx.images.size, 3); // שתי שורות + תמונת-הקשר אחת משותפת
  const badCtx = checkToSiteZip(sampleEntries('ocr', { items: [ocrItem(0, { ctx: { img: ctx.img, bbox: [5, 5, 1, 1] } })] }));
  assert.match(badCtx.errors.join(), /ctx\.bbox/);
});

test('router: מילים — k ייחודי וכתב-מילה מוכר (שגיאה לקובץ)', () => {
  const dupK = routerItem(0, { words: [{ k: 0, box: [1, 0, 50, 54] }, { k: 0, box: [60, 0, 90, 54] }] });
  assert.match(checkToSiteZip(sampleEntries('router', { items: [dupK] })).errors.join(), /k/);
  const badPred = routerItem(0, { words: [{ k: 0, box: [1, 0, 50, 54], pred: 'mixed' }] });
  assert.match(checkToSiteZip(sampleEntries('router', { items: [badPred] })).errors.join(), /לא מוכרת/);
  const noWords = routerItem(2);
  assert.equal(checkToSiteZip(sampleEntries('router', { items: [noWords] })).ok, true);
});

test('router: תיבת-מילה פגומה — אזהרה לשורה, לא דחיית הקובץ; השורה נקלטת בלי words', () => {
  // כמו בקובץ של בעל הפרויקט (2026-10-28): מילה בלי רוחב, x0 == x1
  const zero = (i) => routerItem(i, { words: [{ k: 0, box: [450, 0, 540, 54] }, { k: 1, box: [335, 15, 335, 50], pred: 'rashi' }] });
  const outside = routerItem(3, { words: [{ k: 0, box: [500, 0, 900, 54] }] });
  const items = [routerItem(0), zero(1), routerItem(2), outside, zero(4)];
  const r = checkToSiteZip(unzipSync(zipSync(sampleEntries('router', { items }))));
  assert.deepEqual(r.errors, []);
  assert.equal(r.ok, true);
  assert.equal(r.items.length, 5);
  assert.deepEqual(r.wordBoxLines, [2, 4, 5]);
  assert.deepEqual(r.warnings, ['3 שורות: תיבות-המילים לא תקינות — יחולקו לפי הדיו (שורות 2, 4, 5 בקובץ)']);
  const byUid = new Map(r.items.map((it) => [it.uid, it]));
  assert.equal(byUid.get(zero(1).uid).words, undefined);
  assert.equal(byUid.get(outside.uid).words, undefined);
  assert.equal(byUid.get(routerItem(0).uid).words.length, 4); // שורה תקינה — כמות-שהיא
  assert.equal(byUid.get(zero(1).uid).pred, zero(1).pred); // שאר השדות נשמרים
  // מסמך-המסד: גם בו אין words — המתנדב מקבל חלוקה לפי הדיו
  assert.equal(itemDoc(r.manifest, byUid.get(zero(4).uid)).payload.words, undefined);
});

test('router: שורה אחת עם תיבה פגומה — "שורה אחת"; ושגיאה אמיתית באותה שורה עדיין דוחה', () => {
  const one = routerItem(0, { words: [{ k: 0, box: [10, 0, 10, 54] }] });
  const r = checkToSiteZip(sampleEntries('router', { items: [one] }));
  assert.equal(r.ok, true);
  assert.match(r.warnings[0], /^שורה אחת: תיבות-המילים לא תקינות — יחולקו לפי הדיו \(שורה 1 בקובץ\)$/);
  const alsoBadSig = routerItem(0, { sig: 'nope', words: [{ k: 0, box: [10, 0, 10, 54] }] });
  const r2 = checkToSiteZip(sampleEntries('router', { items: [alsoBadSig] }));
  assert.equal(r2.ok, false);
  assert.deepEqual(r2.wordBoxLines, []);
});

test('router: ctx — אותה צורה כמו ב-ocr (§4.2); תמונת-ההקשר נכתבת ונשמרת במסמך', () => {
  const ctx = { img: 'img/ctx-b-a7f3310c6e-p3.jpg', bbox: [118.5, 880, 1265.5, 994] };
  const r = checkToSiteZip(sampleEntries('router', { items: [routerItem(0, { ctx }), routerItem(1, { ctx })] }));
  assert.equal(r.ok, true);
  assert.equal(r.images.size, 3);
  const doc = itemDoc(r.manifest, r.items[0]);
  assert.equal(doc.ctxPath, storageRel(r.manifest.package_id, ctx.img));
  const missing = sampleEntries('router', { items: [routerItem(0, { ctx })] });
  delete missing[ctx.img];
  assert.match(checkToSiteZip(missing).errors.join(), /תמונת-ההקשר חסרה/);
  const bad = checkToSiteZip(sampleEntries('router', { items: [routerItem(0, { ctx: { img: ctx.img, bbox: [5, 5, 1, 1] } })] }));
  assert.match(bad.errors.join(), /ctx\.bbox/);
});

test('frames: ספר שאינו ב-books.json, זרם לא מוכר, אובייקט בלי סוג, books.json חסר', () => {
  assert.match(
    checkToSiteZip(sampleEntries('frames', { items: [framesItem(0, { book: 'b-0000000000' })] })).errors.join(),
    /books\.json/
  );
  const f = framesItem(0);
  f.frames[1].stream = 's9';
  assert.match(checkToSiteZip(sampleEntries('frames', { items: [f] })).errors.join(), /זרם לא מוכר/);
  const o = framesItem(0);
  delete o.frames[2].obj;
  assert.match(checkToSiteZip(sampleEntries('frames', { items: [o] })).errors.join(), /אובייקט/);
  const e = sampleEntries('frames');
  delete e['books.json'];
  assert.match(checkToSiteZip(e).errors[0], /books\.json/);
  assert.match(checkBooks([{ book: 'b-a7f3310c6e' }, { book: 'b-a7f3310c6e' }]), /כפול/);
});

test('frames: ptype הוא מילה קצרה כלשהי מהתחנה (scan, cols…) — רק לתצוגה', () => {
  assert.equal(checkToSiteZip(sampleEntries('frames', { items: [framesItem(0, { ptype: 'cols' })] })).ok, true);
  assert.match(checkToSiteZip(sampleEntries('frames', { items: [framesItem(0, { ptype: 'שני טורים' })] })).errors.join(), /ptype/);
});

test('frames: מסגרת שגלשה מעבר לקצה התמונה — מקוצרת, אזהרה לעמוד, לא דחיית הקובץ', () => {
  // כמו בקובץ של בעל הפרויקט (2026-11-01): כמה פיקסלים מתחת לתחתית, ומעל הקצה העליון
  const below = framesItem(1, { h: 2600 });
  below.frames[1].box = [5, 2525, 300.4, 2606.6];
  const above = framesItem(3);
  above.frames[0].box = [7.2, -1.5, 1148.5, 62.1];
  const items = [framesItem(0), below, framesItem(2), above];
  const r = checkToSiteZip(unzipSync(zipSync(sampleEntries('frames', { items }))));
  assert.deepEqual(r.errors, []);
  assert.equal(r.ok, true);
  assert.equal(r.items.length, 4);
  assert.deepEqual(r.frameBoxLines, [2, 4]);
  assert.deepEqual(r.warnings, ['2 עמודים: מסגרות שגלשו מעבר לקצה התמונה — קוצרו לגבולות העמוד (שורות 2, 4 בקובץ)']);
  const byUid = new Map(r.items.map((it) => [it.uid, it]));
  assert.deepEqual(byUid.get(below.uid).frames[1].box, [5, 2525, 300.4, 2600]);
  assert.deepEqual(byUid.get(above.uid).frames[0].box, [7.2, 0, 1148.5, 62.1]);
  assert.deepEqual(byUid.get(framesItem(0).uid).frames, framesItem(0).frames); // עמוד תקין — כמות-שהוא
  // מסמך-המסד — עם המסגרת המקוצרת
  assert.deepEqual(itemDoc(r.manifest, byUid.get(below.uid)).payload.frames[1].box, [5, 2525, 300.4, 2600]);
});

test('frames: מסגרת שכולה מחוץ לתמונה, או תיבה הפוכה — עדיין דוחה את הקובץ', () => {
  const out = framesItem(0);
  out.frames[0].box = [100, 2500, 300, 2550];
  const r = checkToSiteZip(sampleEntries('frames', { items: [out] }));
  assert.equal(r.ok, false);
  assert.match(r.errors.join(), /תיבת המסגרת f1/);
  assert.deepEqual(r.frameBoxLines, []);
  const flipped = framesItem(0);
  flipped.frames[0].box = [300, -5, 100, 50];
  assert.match(checkToSiteZip(sampleEntries('frames', { items: [flipped] })).errors.join(), /תיבת המסגרת f1/);
  const one = framesItem(0);
  one.frames[2].box = [100, 300, 1705, 700];
  assert.match(checkToSiteZip(sampleEntries('frames', { items: [one] })).warnings[0], /^עמוד אחד: .* \(שורה 1 בקובץ\)$/);
});

test('frames: עד 40 עמודים בקובץ', () => {
  const items = Array.from({ length: 41 }, (_, i) => framesItem(i));
  assert.match(checkToSiteZip(sampleEntries('frames', { items })).errors.join(), /40/);
});

test('counts.items לא תואם = שגיאה; by_track לא תואם = אזהרה בלבד', () => {
  const short = sampleEntries('ocr', { n: 3, manifest: { counts: { items: 5 } } });
  assert.match(checkToSiteZip(short).errors.join(), /לא שלם/);
  const warn = sampleEntries('ocr', { n: 2, manifest: { counts: { items: 2, by_track: { rashi: 2 } } } });
  const r = checkToSiteZip(warn);
  assert.equal(r.ok, true);
  assert.equal(r.warnings.length, 1);
  assert.deepEqual(r.counts.by_track, { rashi: 1, square: 1 });
});

test('שורה שאינה JSON — מספר השורה בהודעה; הרבה שגיאות — מסוכמות', () => {
  const e = sampleEntries('ocr', { n: 1 });
  e['items.jsonl'] = new TextEncoder().encode('{"uid":\n');
  assert.match(checkToSiteZip(e).errors[0], /שורה 1/);
  const items = Array.from({ length: 40 }, (_, i) => ocrItem(i, { sig: 'bad' }));
  const r = checkToSiteZip(sampleEntries('ocr', { items }));
  assert.equal(r.errors.length, 26);
  assert.match(r.errors.at(-1), /ועוד 15/);
});

test('BOM בתחילת manifest — לא מפריע', () => {
  const e = sampleEntries('ocr');
  e['manifest.json'] = new Uint8Array([0xef, 0xbb, 0xbf, ...e['manifest.json']]);
  assert.equal(checkToSiteZip(e).ok, true);
});

test('גודל הקובץ', () => {
  assert.equal(checkZipSize(1000), null);
  assert.match(checkZipSize(0), /ריק/);
  assert.match(checkZipSize(41 * 1024 * 1024), /40MB/);
});

test('ZIP bomb: גודל התוכן המחולץ מוגבל לפני החילוץ', () => {
  const bomb = zipSync({ 'huge.bin': new Uint8Array(2048) }, { level: 9 });
  assert.throws(() => unzipTrainingZip(bomb, { maxBytes: 1024 }), /מחולץ|גדול מדי/);
});

test('itemDoc: נתיבי התמונה תחת תיקיית החבילה, המסלול והספר', () => {
  const r = checkToSiteZip(sampleEntries('ocr', { items: [ocrItem(0, { ctx: { img: 'img/ctx-1.png', bbox: [1, 1, 5, 5] } })] }));
  const d = itemDoc(r.manifest, r.items[0]);
  assert.equal(d.imagePath, '/uploads/training-proof/tp-20261027-1f3a9c2e/img/22710.png');
  assert.equal(d.ctxPath, '/uploads/training-proof/tp-20261027-1f3a9c2e/img/ctx-1.png');
  assert.equal(d.track, 'rashi');
  assert.equal(d.status, 'available');
  assert.equal(d.part, 1);
  assert.throws(() => storageRel('tp-20261027-1f3a9c2e', '../etc/passwd'));
  assert.throws(() => storageRel('../x', 'img/a.png'));
});
