/**
 * בדיקות איתור העריכה (locate-edit.js): יחידה, ובדיקת תכונה אדוורסרית — "נסגר ⇒ הטעות בפסקה המדווחת תוקנה".
 * הרצה: npm test
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LOCATE, applySpans, canon, canonTokens, lineIndex, locateEdit, locateTarget } from './locate-edit.js';
import { ABSORPTION, evaluateAbsorption } from './absorption.js';

const PARA = 'ובגמרא שם אמר רבי יוחנן הלכא כרבי מאיר בגזירה ובנמצא, ושם מבואר בדברי הראשונים';
const FIXED = PARA.replace('הלכא', 'הלכה');
const fill = (n, tag) => Array.from({ length: n }, (_, i) => `${tag} ${i} מילוי ${i}`);
const around = (lines, i) => ({ before: lines.slice(Math.max(0, i - 12), i), after: lines.slice(i + 1, i + 13) });
const locate = (current, baseLines, li, extra = {}) => locateEdit({
  original: PARA, proposed: FIXED, current: lineIndex(current), base: baseLines ? { index: lineIndex(baseLines), lineIndex: li } : null,
  context: baseLines ? around(baseLines, li) : null, ...extra,
});
const at = (lines, i, text) => lines.map((l, k) => (k === i ? text : l));

test('canon: BOM, צורות הצגה (U+FB33), NFC, תגיות ורווחים — אותו נרמול לבסיס, להצעה ולקובץ', () => {
  assert.equal(canon('דּ'), 'דּ');
  assert.equal(canon('﻿<big>בְּ</big>רֵאשִׁית   בָּרָא<br>אֱלֹהִים'), 'בְּרֵאשִׁית בָּרָא אֱלֹהִים'.normalize('NFC'));
  assert.deepEqual(canonTokens('<b>שם</b>,  ושם'), ['שם', ',', 'ושם']);
  assert.equal(applySpans(PARA, [{ start: PARA.indexOf('הלכא'), end: PARA.indexOf('הלכא') + 4, text: 'הלכה' }]), FIXED);
});

test('canon: הסרת תגיות במעבר אחד — רק תגית שלמה; "<" בודד, "<1>", "</>" ותגית לא סגורה נשארים', () => {
  assert.equal(canon('<b>א</b> < ב'), 'א < ב');
  assert.equal(canon('א <1> ב'), 'א <1> ב');
  assert.equal(canon('א </> ב'), 'א </> ב');
  assert.equal(canon('א <b ב'), 'א <b ב');
  assert.equal(canon('<<b>א'), '<א');
  assert.equal(canon('<a<b>>'), '<a>');
  assert.equal(canon('<span class="x">א</span><BR/>ב'), 'א ב');
});

test('זיהוי ומיפוי: במקום, אחרי הזזה רחוקה, פיצול, איחוד ועריכה רחוקה → fixed; בלי תיקון → not_fixed', () => {
  const base = [...fill(6, 'לפני'), PARA, ...fill(6, 'אחרי')];
  const st = (lines) => locate(lines, base, 6);
  assert.deepEqual([st(base).status, st(base).line], [LOCATE.NOT_FIXED, 6]);
  assert.deepEqual([st(at(base, 6, FIXED)).status, st(at(base, 6, FIXED)).span.text], [LOCATE.FIXED, 'הלכה']);
  const moved = [FIXED, ...base.filter((_, i) => i !== 6)];
  assert.deepEqual([st(moved).status, st(moved).line], [LOCATE.FIXED, 0]);
  const cut = FIXED.indexOf(' הלכה');
  const split = [...base.slice(0, 6), FIXED.slice(0, cut), '', FIXED.slice(cut + 1), ...base.slice(7)];
  assert.deepEqual([st(split).status, st(split).lines], [LOCATE.FIXED, [6, 8]]);
  const merged = [...base.slice(0, 5), `${base[5]} ${FIXED}`, ...base.slice(7)];
  assert.deepEqual([st(merged).status, st(merged).line], [LOCATE.FIXED, 5]);
  assert.equal(st(at(base, 6, FIXED.replace('הראשונים', 'האחרונים'))).status, LOCATE.FIXED, 'עריכה רחוקה מהטעות');
  // אותו נרמול לבסיס, להצעה ולקובץ: דל"ת דגושה כצורת הצגה (U+FB33), תגיות ורווחים כפולים בקובץ
  const dg = (x) => x.replace('בדברי', 'בדּברי');
  const pf = locateEdit({ original: dg(PARA), proposed: dg(FIXED), current: lineIndex(at(base, 6, `<b>${dg(FIXED).replace('דּ', 'דּ')}</b>  `)) });
  assert.equal(pf.status, LOCATE.FIXED, 'צורת הצגה ותגיות');
  // הקלט כהיסטים בשורת הבסיס שקול להצעה
  const edits = [{ start: PARA.indexOf('הלכא'), end: PARA.indexOf('הלכא') + 4, text: 'הלכה' }];
  assert.equal(locateEdit({ original: PARA, edits, current: lineIndex(moved) }).status, LOCATE.FIXED);
});

test('ספק → uncertain: מילים ליד הטעות שונו, נוסח שלישי, פסקה שלא זוהתה, עריכה בלתי נראית', () => {
  const base = [...fill(6, 'לפני'), PARA, ...fill(6, 'אחרי')];
  const st = (lines) => locate(lines, base, 6).status;
  assert.equal(st(at(base, 6, FIXED.replace('יוחנן', 'יוחנא'))), LOCATE.UNCERTAIN, 'עוגן משמאל השתנה');
  assert.equal(st(at(base, 6, FIXED.replace('כרבי', 'כר\''))), LOCATE.UNCERTAIN, 'עוגן מימין השתנה');
  assert.equal(st(at(base, 6, PARA.replace('הלכא', 'הילכתא'))), LOCATE.UNCERTAIN, 'נוסח שלישי');
  assert.equal(st(at(base, 6, 'פסקה אחרת לגמרי שאינה דומה')), LOCATE.UNCERTAIN, 'לא נמצאה');
  assert.equal(locateEdit({ original: PARA, proposed: `<b>${PARA}</b>`, current: lineIndex(base) }).reason, 'invisible_edit');
});

test('תאומים: עותק שלא תוקן חוסם; עותק מתוקן שכבר היה בבסיס אינו ראיה ואינו מתחרה', () => {
  const base = [...fill(4, 'לפני'), PARA, ...fill(8, 'אמצע'), FIXED, ...fill(4, 'אחרי')];
  const st = (lines, withBase = true) => locate(lines, withBase ? base : null, 4);
  // לא תוקן, התאום המתוקן נשאר → הטעות עדיין בספר
  assert.equal(st(base).status, LOCATE.NOT_FIXED);
  // תוקן, והתאום נשאר: עם הבסיס — fixed; בלי הבסיס אין דרך לדעת איזה עותק חדש → uncertain
  const fixed = at(base, 4, FIXED);
  assert.deepEqual([st(fixed).status, st(fixed).scores.twins], [LOCATE.FIXED, 1]);
  assert.equal(st(fixed, false).status, LOCATE.UNCERTAIN);
  // הפסקה המקורית נמחקה והתאום נשאר — אין תיקון חדש
  assert.equal(st(base.filter((_, i) => i !== 4)).reason, 'fix_not_new');
  // עותק שני של הפסקה שלא תוקן (נוצר אחרי הדיווח) → not_fixed גם כשהעותק המדווח תוקן
  assert.equal(st([...fixed, PARA]).status, LOCATE.NOT_FIXED);
  // שני עותקים מתוקנים חדשים — עמימות
  assert.equal(st([...fixed, FIXED]).reason, 'ambiguous');
});

test('שורה קצרה (כותרת): רק התאמה מלאה, במקום שהשכנים מהבסיס מאשרים, ובלי שורה שמכילה את המקור', () => {
  const T = 'טקסט ארוך דיו כדי להיחשב שורה ארוכה לעיגון ';
  const base = ['<h2>חלק א</h2>', `${T}1`, '<h3>יא</h3>', `${T}2`, '<h3>יא</h3>', `${T}3`, '<h3>יג</h3>'];
  const run = (lines, withBase = true) => locateEdit({
    original: '<h3>יא</h3>', proposed: '<h3>יב</h3>', current: lineIndex(lines), base: withBase ? { index: lineIndex(base), lineIndex: 4 } : null, context: around(base, 4),
  });
  assert.equal(run(at(base, 4, '<h3>יב</h3>')).status, LOCATE.UNCERTAIN, 'הכותרת הזהה למעלה עדיין מכילה את המקור');
  const clean = at(at(base, 4, '<h3>יב</h3>'), 2, '<h3>י</h3>');
  assert.deepEqual([run(clean).status, run(clean).line], [LOCATE.FIXED, 4]);
  assert.equal(run(at(base, 2, '<h3>י</h3>')).status, LOCATE.NOT_FIXED);
  assert.equal(run([...clean.slice(0, 1), ...clean.slice(2)]).status, LOCATE.FIXED, 'שורה שנמחקה מעל — השכנים עדיין מאשרים');
  assert.equal(run(['<h3>יב</h3>', ...clean.filter((_, i) => i !== 4)]).status, LOCATE.UNCERTAIN, 'כותרת שזזה בלי שכניה');
});

// הביקורת החיצונית (#312): הכותרת המקורית זזה ושמרה את הטעות, ובמקומה הקודם הופיעה כותרת זהה להצעה.
test('הביקורת: מקור שזז ועוצב מחדש (פוצל לשורות, הורחב, אוחד) ופיתיון זהה להצעה במקום הישן → לא fixed', () => {
  const original = '<h2>דיני תפלה הלכא למעשה</h2>';
  const proposed = original.replace('הלכא', 'הלכה');
  const base = ['פתח דבר', 'כללי הפרק', original, 'סיכום לתלמיד', 'מקורות', 'לסיום'];
  const run = (lines) => locateEdit({ original, proposed, current: lineIndex(lines), base: { index: lineIndex(base), lineIndex: 2 }, context: around(base, 2) });
  const decoy = at(base, 2, proposed);
  assert.equal(run(decoy).status, LOCATE.FIXED, 'בלי עותק שזז — התיקון במקום מזוהה');
  for (const [label, moved] of Object.entries({
    'פוצלה לארבע שורות': ['<h2>דיני', 'תפלה', 'הלכא', 'למעשה</h2>'],
    'פוצלה לשש שורות עם שורות ריקות': ['<h2>דיני', '', 'תפלה', 'הלכא', '', 'למעשה</h2>'],
    'הורחבה בשורה אחת': ['<h2>דיני תפלה ומנהגיה הלכא למעשה לראש חודש בבית הכנסת</h2>'],
    'אוחדה עם שכנה': ['מקורות נוספים לעיון דיני תפלה הלכא למעשה'],
  })) {
    const r = run([...decoy, ...moved]);
    assert.notEqual(r.status, LOCATE.FIXED, label);
    assert.ok(['original_fragment', 'original_elsewhere'].includes(r.reason), `${label}: ${r.reason}`);
  }
  // פסקה ארוכה שזזה ופוצלה לשורה לכל מילה (אף חלון של עד 3 שורות אינו "דומה") — אותה הגנה
  const long = [...fill(6, 'לפני'), PARA, ...fill(6, 'אחרי')];
  const words = PARA.split(' ');
  const r = locate([...at(long, 6, FIXED), ...fill(3, 'עוד'), ...words], long, 6);
  assert.deepEqual([r.status, r.reason], [LOCATE.UNCERTAIN, 'original_fragment']);
  assert.equal(locate([...at(long, 6, FIXED), ...fill(3, 'עוד'), ...FIXED.split(' ')], long, 6).status, LOCATE.FIXED, 'גם העותק המפוצל תוקן — הטעות אינה בשום מקום');
  // החתימה ספציפית לבסיס: "הלכא" לבדה מופיעה בשורה אחרת בבסיס — לא חוסמת; עם ההקשר — חוסמת
  const busy = [...base.slice(0, 5), 'גם כאן הלכא אחרת לגמרי', 'לסיום'];
  const withBusy = (lines) => locateEdit({ original, proposed, current: lineIndex(lines), base: { index: lineIndex(busy), lineIndex: 2 }, context: around(busy, 2) });
  assert.equal(withBusy(at(busy, 2, proposed)).status, LOCATE.FIXED);
  assert.equal(withBusy([...at(busy, 2, proposed), 'תפלה', 'הלכא']).reason, 'original_fragment');
});

test('locateTarget (המפרסם): כתיבה רק במופע היחיד של המקור — לא בשורה זהה מפסקה אחרת ולא בפיתיון', () => {
  const T = 'באמצע הפסקה הייחודית נשארה המילה השגיאה ויש עוד מה להגיה';
  const NEWT = T.replace('השגיאה', 'השגחה');
  const base = ['הקדמת המחבר', 'הכרעת חכמים בעניין זה', T, 'ועתה ראו חידוש נפלא', 'סיום הספר'];
  const run = (lines, b = base, li = 2, original = T, proposed = NEWT) => locateTarget({
    original, proposed, current: lineIndex(lines), base: { index: lineIndex(b), lineIndex: li }, context: around(b, li),
  });
  const shifted = ['שורה חדשה', ...base];
  assert.deepEqual([run(shifted).status, run(shifted).target], [LOCATE.NOT_FIXED, 3]);
  // הביקורת, פרסום ישיר: שורה זהה מפסקה אחרת במקום הישן והפסקה עצמה זזה → אין יעד
  const impostor = ['הקדמת המחבר', 'אמרות מפרק אחר', T, 'תוספות', 'הכרעת חכמים בעניין זה', T, 'ועתה ראו חידוש נפלא', 'סיום הספר'];
  assert.deepEqual([run(impostor).target, run(impostor).targetReason], [null, 'target_ambiguous']);
  // הביקורת, PR: במקום הישן כבר ההצעה (מפסקה אחרת), והמקור זז → לא fixed ואין יעד
  const decoy = at(impostor, 2, NEWT);
  assert.deepEqual([run(decoy).status, run(decoy).target], [LOCATE.NOT_FIXED, null]);
  assert.deepEqual([run(at(base, 2, NEWT)).status, run(at(base, 2, NEWT)).target], [LOCATE.FIXED, null]);
  // תאום בבסיס, או המקור שזז ופוצל (חתימת הטעות גם מחוץ לשורה) → אין יעד
  const twins = [...base, 'שורה', T];
  assert.deepEqual([run(at(twins, 6, 'אחר'), twins).target, run(at(twins, 6, 'אחר'), twins).targetReason], [null, 'twin_in_base']);
  assert.equal(run([...shifted, 'נשארה המילה', 'השגיאה ויש']).target, null);
  assert.equal(run(at(shifted, 3, `${T} נוסף`)).target, null, 'השורה השתנתה');
  // שורה קצרה: רק במקום שהשכנים מאשרים, ובלי עותק נוסף של ההצעה
  const hb = ['פתח', 'כללי הפרק', '<h2>דיני תפלה הלכא למעשה</h2>', 'סיכום לתלמיד', 'מקורות'];
  const h = (lines) => run(lines, hb, 2, hb[2], hb[2].replace('הלכא', 'הלכה'));
  assert.equal(h(['חדש', ...hb]).target, 3);
  assert.equal(h(['<h2>דיני תפלה הלכה למעשה</h2>', ...hb]).target, null, 'ההצעה נוספה במקום אחר');
});

// ---- בדיקת תכונה: מה שמנהל הספרייה והספרייה עושים לקובץ בין הדיווח לבדיקה ----

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const LETTERS = [...'אבגהוזחטיכלמנסעפצקרשת'];
const DAGESH_D = 'דּ';
const COMMON = ['של', 'את', 'על', 'כי', 'לא', 'אם', 'הוא', 'זה', 'גם', 'או'];
const PUNCT = [',', ':', '.'];

function render(L) {
  const s = L.t.map((x, i) => (L.b === i ? `<b>${x.w}</b>` : x.w)).join(L.sp ? '  ' : ' ');
  const h = L.h ? `<h3>${s}</h3>` : s;
  return L.pf ? h.replaceAll(DAGESH_D, 'דּ') : h;
}

/**
 * תרחיש: קובץ בסיס עם פסקה מדווחת (החלפה/מחיקה/הוספה של מילה), תאומים ושורות-פיתיון אופציונליים, ואז 0–5 פעולות
 * (הזזה קרובה/רחוקה, עריכת מילים ליד/רחוק מהטעות, פיתיונות עם ההצעה, שכפול מתוקן/לא, פיצול, איחוד, שורות
 * שנוספו/נמחקו, תגיות, צורות הצגה) ותיקון: במקום הנכון בכל העותקים, רק בחלקם, במקום הלא נכון, או בכלל לא.
 * reshape (הביקורת): גם הזזה עם עיצוב מחדש — פיצול ל-k שורות, איחוד עם שכנה, הרחבה בשורה (גם מילה צמודה לטעות) —
 * ופיתיונות זהים להצעה במקום הישן או זהים למקור במקום אחר. בלי reshape — אותם תרחישים בדיוק כמו קודם.
 * האמת ידועה: כל אסימון ממקום הטעות נושא סימון, ו"תוקן" = בכל עותקי הפסקה המדווחת הטעות תוקנה. "פתוח" (הפרה אם
 * נסגר) = מקום טעות שלא תוקן ועדיין צמוד בזרם האסימונים לשכן מקורי שלו מהפסקה (מילה כפולה — לבת-זוגה); מקום טעות
 * שנותק מכל שכניו (הפסקה נחתכה בדיוק סביבו והחלקים פוזרו) אינו ניתן לייחוס בשום טקסט — נספר בנפרד (dissolved).
 * עריכת מילים — רק בפסקה בת 6 מילים לפחות, ועד שתי עריכות (מעבר לזה זו כבר פסקה אחרת).
 */
function scenario(seed, { reshape = false } = {}) {
  const r = rng(seed);
  const int = (n) => Math.floor(r() * n);
  const pick = (a) => a[int(a.length)];
  const chance = (p) => r() < p;
  const vocab = Array.from({ length: 300 }, () => {
    const w = Array.from({ length: 2 + int(4) }, () => pick(LETTERS)).join('');
    return chance(0.1) ? w[0] + DAGESH_D + w.slice(1) : w;
  });
  const word = () => (chance(0.2) ? pick(COMMON) : pick(vocab));
  const para = (n) => Array.from({ length: n }, (_, i) => ({ w: i > 0 && chance(0.07) ? pick(PUNCT) : word() }));
  const randomLine = () => {
    const k = r();
    return k < 0.08 ? { t: [] } : k < 0.16 ? { t: para(1 + int(2)), h: true } : { t: para(4 + int(20)) };
  };
  const strip = (L) => ({ ...L, t: L.t.map((x) => ({ w: x.w })) });
  const copy = (L) => ({ ...L, t: L.t.map((x) => ({ ...x })) });
  const isWordTok = (x) => !PUNCT.includes(x.w);
  const place = (n) => int(n + 1);

  const kind = pick(['replace', 'replace', 'replace', 'replace', 'delete', 'insert']);
  const P = chance(0.12) ? { t: para(1 + int(2)), h: true } : { t: para(3 + int(22)) };
  P.t.forEach((x) => { x.p = 1; });
  let C = null;
  let E = null;
  if (kind === 'replace') {
    const k = pick(P.t.flatMap((x, i) => (isWordTok(x) ? [i] : [])));
    C = P.t[k].w;
    E = C.slice(0, -1) + pick(LETTERS.filter((x) => x !== C.at(-1)));
    P.t[k] = { w: E, p: 1, err: 1 };
    if (chance(0.25)) P.t.splice(place(P.t.length), 0, { w: E, p: 1 });
  } else if (kind === 'delete') {
    const k = 1 + int(P.t.length);
    P.t.splice(k, 0, { w: chance(0.5) ? P.t[k - 1].w : word(), p: 1, err: 1 });
  } else {
    const k = int(P.t.length);
    P.t[k].mark = 1;
    // מילה שונה מהשכנות לנקודת ההוספה — אחרת הוספה "במקום הלא נכון" זהה בטקסט להוספה הנכונה
    do C = word(); while (C === P.t[k].w || C === P.t[k + 1]?.w);
  }
  const siteOf = (L) => L.t.findIndex((x) => x.err || x.mark);
  const applyFix = (L) => {
    if (kind === 'replace') L.t.forEach((x) => { if (x.err) x.w = C; });
    else if (kind === 'delete') L.t = L.t.filter((x) => !x.err);
    else L.t = L.t.flatMap((x, i) => (x.mark && !L.t[i + 1]?.fix ? [x, { w: C, p: 1, fix: 1 }] : [x]));
  };
  P.t.forEach((x, i) => { x.id = i; }); // זהות האסימונים בפסקה המקורית — לבדיקת "צמוד לשכן מקורי"
  const fixedP = copy(P);
  applyFix(fixedP);
  const site = siteOf(P);
  const decoy = () => ({ t: [...para(2 + int(4)), ...fixedP.t.slice(Math.max(0, site - 3), site + 4).map((x) => ({ w: x.w })), ...para(2 + int(4))] });

  const baseSize = 16 + int(24);
  const base = Array.from({ length: baseSize }, randomLine);
  base.splice(place(base.length), 0, P);
  if (chance(0.1)) base.splice(place(base.length), 0, strip(P)); // תאום שלא תוקן (פסקה אחרת, זהה)
  if (chance(0.12)) base.splice(place(base.length), 0, strip(fixedP)); // תאום מתוקן שכבר היה בבסיס
  if (chance(0.15)) base.splice(place(base.length), 0, decoy()); // שורה אחרת שכבר נושאת את ההצעה
  if (E && chance(0.1)) base.splice(place(base.length), 0, { t: [...para(3), { w: E }, ...para(3)] });
  const li = base.indexOf(P);
  const twinsInBase = base.length - baseSize - 1 > 0;

  const main = base.map(copy);
  const isDesc = (L) => L.t.some((x) => x.p);
  const descIdx = () => main.flatMap((L, i) => (isDesc(L) ? [i] : []));
  const otherIdx = () => main.flatMap((L, i) => (isDesc(L) ? [] : [i]));
  const descWords = () => main.filter(isDesc).reduce((n, L) => n + L.t.filter((x) => x.p && isWordTok(x)).length, 0);
  const editable = (x) => !x.err && !x.mark && !x.fix;
  let wordEdits = 0;
  let benign = !twinsInBase;
  const editWord = (near) => {
    if (wordEdits >= 2 || descWords() < 6) return;
    const L = main.find((x) => siteOf(x) >= 0);
    if (!L) return;
    const s = siteOf(L);
    const cand = L.t.flatMap((x, i) => (editable(x) && (near ? Math.abs(i - s) <= 2 && i !== s : Math.abs(i - s) >= 4) ? [i] : []));
    if (!cand.length) return;
    const i = pick(cand);
    L.t[i] = { ...L.t[i], w: word() };
    wordEdits += 1;
  };
  const ops = {
    moveNear() {
      const i = pick(descIdx());
      const [L] = main.splice(i, 1);
      main.splice(Math.max(0, Math.min(main.length, i + (chance(0.5) ? 1 : -1) * (1 + int(4)))), 0, L);
    },
    moveFar() {
      const [L] = main.splice(pick(descIdx()), 1);
      main.splice(place(main.length), 0, L);
    },
    editNear: () => editWord(true),
    editFar: () => editWord(false),
    decoyFixed: () => main.splice(place(main.length), 0, strip(fixedP)),
    decoyContext: () => main.splice(place(main.length), 0, decoy()),
    duplicate() {
      const i = pick(descIdx());
      const L = copy(main[i]);
      if (chance(0.5)) applyFix(L);
      main.splice(chance(0.5) ? Math.min(main.length, i + 1 + int(3)) : place(main.length), 0, L);
    },
    split() {
      const idx = descIdx().filter((i) => !main[i].h && main[i].t.length >= 4);
      if (!idx.length) return;
      const i = pick(idx);
      const L = main[i];
      const k = 1 + int(L.t.length - 1);
      main.splice(i, 1, { ...L, t: L.t.slice(0, k), b: undefined }, ...(chance(0.2) ? [{ t: [] }] : []), { ...L, t: L.t.slice(k), b: undefined });
    },
    merge() {
      const idx = descIdx().filter((i) => !main[i].h);
      if (!idx.length) return;
      const i = pick(idx);
      const j = chance(0.5) ? i - 1 : i + 1;
      const N = main[j];
      if (!N || N.h || !N.t.length) return;
      const [a, b] = j < i ? [N, main[i]] : [main[i], N];
      main.splice(Math.min(i, j), 2, { t: [...a.t, ...b.t] });
    },
    insertLines() {
      for (let n = 1 + int(25); n > 0; n--) main.splice(place(main.length), 0, randomLine());
    },
    deleteLines() {
      for (let n = 1 + int(8); n > 0; n--) {
        const idx = otherIdx();
        if (idx.length) main.splice(pick(idx), 1);
      }
    },
    editOther() {
      const idx = otherIdx().filter((i) => main[i].t.length);
      if (!idx.length) return;
      const L = main[pick(idx)];
      L.t[int(L.t.length)].w = word();
    },
    presentation() {
      (chance(0.5) ? main[pick(descIdx())] : pick(main)).pf = true;
    },
    bold() {
      const L = chance(0.5) ? main[pick(descIdx())] : pick(main);
      if (L.t.length) L.b = int(L.t.length);
    },
    spaces() {
      pick(main).sp = true;
    },
  };
  const reshapeOps = {
    // הביקורת: הפסקה זזה ועוצבה מחדש — פוצלה ל-k שורות, אוחדה עם שכנה או הורחבה בשורה — ולעתים פיתיון זהה להצעה
    // נשאר במקומה הישן; reviewAttack — תמיד פיתיון, פיצול לשלוש שורות לפחות או מילה צמודה לטעות מצד אחד.
    relocateSplit: () => relocate(splitLine),
    relocateJoin: () => relocate(joinLine),
    relocateExtend: () => relocate(extendLine),
    reviewAttack: () => relocate(pick([(L) => splitLine(L, 3), (L) => extendLine(L, true), joinLine]), true),
    decoyAtOld: () => main.splice(Math.min(li, main.length), 0, strip(fixedP)),
    decoyOriginal: () => main.splice(place(main.length), 0, strip(P)),
  };
  function relocate(reshape, decoy = chance(0.5)) {
    const i = pick(descIdx());
    const [L] = main.splice(i, 1);
    if (decoy) {
      main.splice(i, 0, strip(fixedP));
      benign = false;
    }
    main.splice(place(main.length), 0, ...reshape(L));
  }
  function splitLine(L, atLeast = 2) {
    if (L.t.length < 2) return [L];
    const lo = Math.min(atLeast, L.t.length);
    const k = lo + int(Math.min(6, L.t.length) - lo + 1);
    const cuts = new Set();
    while (cuts.size < k - 1) cuts.add(1 + int(L.t.length - 1));
    const at = [0, ...[...cuts].sort((x, y) => x - y), L.t.length];
    return at.slice(1).flatMap((e, j) => [...(j && chance(0.2) ? [{ t: [] }] : []), { ...L, t: L.t.slice(at[j], e), b: undefined }]);
  }
  function joinLine(L) {
    const idx = otherIdx().filter((j) => main[j].t.length);
    if (!idx.length) return [L];
    const [N] = main.splice(pick(idx), 1);
    return [{ t: chance(0.5) ? [...N.t, ...L.t] : [...L.t, ...N.t] }];
  }
  function extendLine(L, adjacent = false) {
    const t = [...L.t];
    if (chance(0.6)) t.push(...para(1 + int(8)));
    if (chance(0.5) || t.length === L.t.length) t.unshift(...para(1 + int(8)));
    if (adjacent || chance(0.3)) {
      // מילה באמצע (ב-adjacent — צמודה לטעות מצד אחד); לא מילת התיקון, ולא מיד אחרי נקודת ההוספה
      const site = t.findIndex((x) => x.err || x.mark);
      const p = adjacent && site >= 0 ? site + int(2) : place(t.length);
      const w = word();
      if (w !== C && w !== E && !t[p - 1]?.mark) t.splice(p, 0, { w });
    }
    return [{ ...L, t, b: undefined }];
  }
  const mode = pick(['right', 'right', 'right', 'right', 'right', 'some', 'wrong', 'wrong', 'none', 'none', 'none']);
  if (mode !== 'right') benign = false;
  const fix = () => {
    const carriers = main.filter((L) => isDesc(L) && siteOf(L) >= 0);
    if (mode === 'right') carriers.forEach(applyFix);
    else if (mode === 'some' && carriers.length > 1) carriers.slice(0, 1 + int(carriers.length - 1)).forEach(applyFix);
    else if (mode === 'wrong') {
      const options = [() => main.splice(place(main.length), 0, strip(fixedP))];
      const holders = main.filter((L) => L.t.some((x) => !x.err && x.w === E));
      if (E && holders.length) {
        options.push(() => {
          const L = pick(holders);
          L.t.find((x) => !x.err && x.w === E).w = C;
        });
      }
      if (kind === 'insert' && carriers.length) options.push(() => carriers[0].t.splice(siteOf(carriers[0]), 0, { w: C }));
      pick(options)();
    }
  };
  const all = reshape ? { ...ops, ...reshapeOps } : ops;
  const names = Object.keys(all);
  const n = int(6);
  const fixAt = int(n + 1);
  for (let k = 0; k <= n; k++) {
    if (k === fixAt) fix();
    if (k < n) {
      const op = pick(names);
      if (['editNear', 'decoyFixed', 'decoyContext', 'duplicate', 'decoyAtOld', 'decoyOriginal'].includes(op)) benign = false;
      all[op]();
    }
  }

  const truthOf = (lines) => {
    const all = lines.flatMap((L) => L.t);
    if (kind === 'replace') {
      const errs = all.filter((x) => x.err);
      return errs.length > 0 && errs.every((x) => x.w === C);
    }
    if (kind === 'delete') return !all.some((x) => x.err);
    const marks = all.flatMap((x, i) => (x.mark ? [i] : []));
    return marks.length > 0 && marks.every((i) => all[i + 1]?.fix);
  };
  // מקום טעות פתוח וצמוד לשכן מקורי (בהוספה — הצומת עצמו: הסימון ואחריו השכן המקורי, או בסוף הפסקה — לפניו).
  // פסקה של אסימון אחד — אין לו שכנים, והוא תמיד "צמוד".
  const anchoredOpen = (lines) => {
    const all = lines.flatMap((L) => L.t);
    const nb = (j, id) => all[j] !== undefined && all[j].id === id;
    return all.some((x, i) => {
      if (kind === 'insert') {
        if (!x.mark || all[i + 1]?.fix) return false;
        if (P.t.length === 1) return true;
        return x.id === P.t.length - 1 ? nb(i - 1, x.id - 1) : nb(i + 1, x.id + 1);
      }
      if (!x.err || (kind === 'replace' && x.w === C)) return false;
      // מילה כפולה למחיקה: הטעות היא הכפילות עצמה — רק כשהיא צמודה לבת-זוגה
      const twin = kind === 'delete' ? [-1, 1].find((d) => P.t[x.id + d]?.w === x.w) : undefined;
      if (twin !== undefined) return nb(i + twin, x.id + twin);
      return P.t.length === 1 || nb(i - 1, x.id - 1) || nb(i + 1, x.id + 1);
    });
  };
  // המפרסם כותב את ההצעה בשורה k: האם אז הטעות בפסקה המדווחת תוקנה בכל עותקיה (שורה בלי סימון — פסקה אחרת)
  const truthIfWritten = (k) => truthOf(main.map((L, i) => {
    if (i !== k) return L;
    const W = copy(L);
    applyFix(W);
    return W;
  }));
  return {
    kind, mode, truth: truthOf(main), open: anchoredOpen(main), truthIfWritten, benign, li, original: render(P), proposed: render(fixedP), baseTexts: base.map(render), mainTexts: main.map(render),
  };
}

/** כמו evaluate ב-closed-pr.js: מעבר ראשון בלי הבסיס המלא, ואם צריך — שני איתו; requireBase תמיד. */
function productionVerdict(s, context) {
  const change = { lineIndex: s.li, originalLine: s.original, newLine: s.proposed, base: context };
  const opts = { relocationLines: 50, requireBase: true };
  const v = evaluateAbsorption({ texts: s.mainTexts }, change, opts);
  const needsBase = v.outcome === ABSORPTION.ABSORBED || ['relocated_unanchored', 'base_required'].includes(v.detail);
  return needsBase ? evaluateAbsorption({ texts: s.mainTexts }, { ...change, baseLines: s.baseTexts }, opts) : v;
}

const PROPERTY_SCENARIOS = Number(process.env.LOCATE_PROPERTY_SCENARIOS) || 3000;

test(`תכונה: נסגר ⇒ הטעות בפסקה המדווחת תוקנה (${PROPERTY_SCENARIOS} תרחישים, seed קבוע) — ושיעור הזיהוי`, (t) => {
  const stats = { scenarios: 0, trulyFixed: 0, located: 0, absorbed: 0, locateViolations: 0, absorbViolations: 0, benign: 0, benignLocated: 0 };
  const bad = [];
  const misses = {};
  for (let seed = 1; seed <= PROPERTY_SCENARIOS; seed++) {
    const s = scenario(seed);
    const context = around(s.baseTexts, s.li);
    const loc = locateEdit({
      original: s.original, proposed: s.proposed, current: lineIndex(s.mainTexts), base: { index: lineIndex(s.baseTexts), lineIndex: s.li }, context,
    });
    const v = productionVerdict(s, context);
    stats.scenarios += 1;
    if (s.truth) stats.trulyFixed += 1;
    if (loc.status === LOCATE.FIXED) {
      if (s.truth) stats.located += 1;
      else {
        stats.locateViolations += 1;
        bad.push({ seed, by: 'locate', kind: s.kind, mode: s.mode, reason: loc.reason });
      }
    }
    if (s.truth && s.benign) {
      stats.benign += 1;
      if (loc.status === LOCATE.FIXED) stats.benignLocated += 1;
    }
    if (s.truth && loc.status !== LOCATE.FIXED) misses[loc.reason] = (misses[loc.reason] || 0) + 1;
    if (v.outcome === ABSORPTION.ABSORBED) {
      if (s.truth) stats.absorbed += 1;
      else {
        stats.absorbViolations += 1;
        bad.push({ seed, by: 'absorption', kind: s.kind, mode: s.mode, detail: v.detail });
      }
    }
  }
  const pct = (x) => `${((100 * x) / stats.trulyFixed).toFixed(1)}%`;
  t.diagnostic(`property: ${JSON.stringify(stats)} recall(locate)=${pct(stats.located)} recall(absorption)=${pct(stats.absorbed)} recall(locate, בלי פיתיונות/תאומים/שכפול/עריכה צמודה)=${((100 * stats.benignLocated) / stats.benign).toFixed(1)}%`);
  t.diagnostic(`property: תיקונים אמיתיים שלא זוהו, לפי סיבה: ${JSON.stringify(misses)}`);
  assert.deepEqual(bad.slice(0, 10), [], `הפרות: ${bad.length}`);
  // הזיהוי אינו "תמיד ספק": רוב התיקונים האמיתיים מזוהים (משני לאינווריאנט)
  assert.ok(stats.located / stats.trulyFixed > 0.5, JSON.stringify(stats));
});

test(`תכונה (הביקורת — הזזה ועיצוב מחדש, פיתיונות): נסגר ⇒ אין טעות פתוחה; יעד לכתיבה ⇒ הכתיבה בו מתקנת (${PROPERTY_SCENARIOS} תרחישים)`, (t) => {
  const stats = {
    scenarios: 0, trulyFixed: 0, located: 0, absorbed: 0, locateViolations: 0, absorbViolations: 0, benign: 0, benignLocated: 0,
    dissolved: 0, dissolvedClosed: 0, writable: 0, targets: 0, targetViolations: 0,
  };
  const bad = [];
  const misses = {};
  // המפרסם (locateTarget) כותב רק כשהשורה ביעד זהה למקור בדיוק (applyLineChange); אז — אחרי הכתיבה הטעות בפסקה
  // המדווחת תוקנה בכל עותקיה. נבדק גם על התרחישים הרגילים.
  const checkTarget = (s, input, loc, seed) => {
    const tg = locateTarget(input);
    const exact = s.mainTexts.flatMap((x, i) => (x === s.original ? [i] : []));
    const writable = !s.truth && exact.length === 1 && s.truthIfWritten(exact[0]);
    if (writable) stats.writable += 1;
    if (tg.status !== loc.status) bad.push({ seed, by: 'target_status', kind: s.kind, mode: s.mode });
    if (tg.target === null || s.mainTexts[tg.target] !== s.original) return;
    if (writable && tg.target === exact[0]) stats.targets += 1;
    if (!s.truthIfWritten(tg.target)) {
      stats.targetViolations += 1;
      bad.push({ seed, by: 'target', kind: s.kind, mode: s.mode, target: tg.target });
    }
  };
  for (let seed = 1; seed <= PROPERTY_SCENARIOS; seed++) {
    const s = scenario(seed, { reshape: true });
    const context = around(s.baseTexts, s.li);
    const input = { original: s.original, proposed: s.proposed, current: lineIndex(s.mainTexts), base: { index: lineIndex(s.baseTexts), lineIndex: s.li }, context };
    const loc = locateEdit(input);
    const v = productionVerdict(s, context);
    stats.scenarios += 1;
    if (s.truth) stats.trulyFixed += 1;
    if (!s.truth && !s.open) stats.dissolved += 1;
    if (loc.status === LOCATE.FIXED) {
      if (s.truth) stats.located += 1;
      else if (!s.open) stats.dissolvedClosed += 1;
      else {
        stats.locateViolations += 1;
        bad.push({ seed, by: 'locate', kind: s.kind, mode: s.mode, reason: loc.reason });
      }
    }
    if (s.truth && s.benign) {
      stats.benign += 1;
      if (loc.status === LOCATE.FIXED) stats.benignLocated += 1;
    }
    if (s.truth && loc.status !== LOCATE.FIXED) misses[loc.reason] = (misses[loc.reason] || 0) + 1;
    if (v.outcome === ABSORPTION.ABSORBED) {
      if (s.truth) stats.absorbed += 1;
      else if (s.open) {
        stats.absorbViolations += 1;
        bad.push({ seed, by: 'absorption', kind: s.kind, mode: s.mode, detail: v.detail });
      }
    }
    checkTarget(s, input, loc, seed);
    const c = scenario(seed);
    const cInput = { original: c.original, proposed: c.proposed, current: lineIndex(c.mainTexts), base: { index: lineIndex(c.baseTexts), lineIndex: c.li }, context: around(c.baseTexts, c.li) };
    checkTarget(c, cInput, locateEdit(cInput), -seed);
  }
  const pct = (x, n) => `${((100 * x) / n).toFixed(1)}%`;
  t.diagnostic(`reshape: ${JSON.stringify(stats)} recall(locate)=${pct(stats.located, stats.trulyFixed)} recall(absorption)=${pct(stats.absorbed, stats.trulyFixed)} recall(locate, בלי פיתיונות/תאומים/שכפול/עריכה צמודה)=${pct(stats.benignLocated, stats.benign)} recall(target)=${pct(stats.targets, stats.writable)}`);
  t.diagnostic(`reshape: תיקונים אמיתיים שלא זוהו, לפי סיבה: ${JSON.stringify(misses)}`);
  assert.deepEqual(bad.slice(0, 10), [], `הפרות: ${bad.length}`);
  // משני לאינווריאנט: גם עם התרחישים האדוורסריים רוב התיקונים האמיתיים בלי פיתיונות/תאומים/שכפול מזוהים
  assert.ok(stats.benignLocated / stats.benign > 0.75 && stats.located / stats.trulyFixed > 0.4, JSON.stringify(stats));
});
