import sanitizeHtml from 'sanitize-html';
import { CLAIM_HOURS, MAX_HELD } from './gridState.js';
import { SUBMITTED_WAITING } from './helpTexts.js';
import { STAGE_TEXT } from './stages.js';
import { GUIDE_FIGURES } from './guideFigures.js';

// דף ההנחיות להגהת עמודים (/docs/page-proof) — התוכן נערך מדף הניהול (בעל הפרויקט, 2026-10-06: "להגיה את הדף בדף הניהול,
// בלי לשלוח בקשת-שינוי על כל הגהה"). לוגיקה טהורה (בלי מסד ובלי DOM): הנוסח המקורי, הניקוי, והקודים. הצד שכותב למסד —
// guideStore.js; הדף — app/docs/page-proof; העורך — components/pageProof/admin/GuideEditorCard.
//
// הפורמט: HTML פשוט. כל פרק — <section id="…"><h2><span class="material-symbols-outlined">אייקון</span>כותרת</h2>…</section>
// (מהכותרות נבנה תוכן-הדף). מותר: כותרות h2/h3, פסקאות (class "note" = מסגרת-הדגשה, "muted" = משני, "lead" = פתיחה),
// רשימות, b/i/u, kbd, br, קישור (http/https או נתיב באתר). כל השאר יורד בניקוי.
// הקודים (בטקסט עצמו, כדי שהדף יישאר מעודכן כשהעורך משתנה):
//   [[איור:שם]]   — אחד מהאיורים (GUIDE_FIGURES) בשורה משלו
//   [[כפתור:מפתח]] — שם כפתור מהעורך (STAGE_TEXT), למשל [[כפתור:finish]]
//   [[ערך:מפתח]]   — מספר/נוסח מהאתר (GUIDE_VALUES), למשל [[ערך:שעות]]

export const GUIDE_KEY = 'page_proof_guide';
export const MAX_GUIDE_HTML = 200 * 1024;

// האיורים: הקוד ← שם הרכיב (guideFigures.js)
export { GUIDE_FIGURES };

// [[כפתור:…]] — רק נוסחים קצרים (שמות כפתורים), לא ההסברים הארוכים
export const GUIDE_BUTTONS = Object.freeze(['finish', 'finishRecut', 'finishAsk', 'skip', 'back']);

export const GUIDE_VALUES = Object.freeze({
  'שעות': String(CLAIM_HOURS),
  'עמודים': String(MAX_HELD),
  'הוגש': SUBMITTED_WAITING,
});

// הנוסח המקורי — מה שהדף מציג כל עוד לא נשמר נוסח בדף הניהול, ונקודת-ההתחלה לעריכה
export const DEFAULT_GUIDE_HTML = `<p class="lead">כל עמוד עובר שני שלבים: <b>קודם המבנה</b> (מסגרות ושורות), <b>ואחר כך הטקסט</b>. כל מה שתעשו נשמר לבד, גם בשרת — אפשר להמשיך ממחשב אחר.</p>

<section id="structure">
<h2><span class="material-symbols-outlined">space_dashboard</span>שלב 1: המבנה</h2>
<ol>
<li><b>מסגרת לכל אזור טקסט.</b> שני טורים = שתי מסגרות. הערות מתחת לקו = מסגרת משלהן.
[[איור:שני-טורים]]</li>
<li><b>ריהוט הדף</b> — כותרת-רצה, מספר עמוד, שם הספר בראש העמוד, מילת-ההמשך בתחתית, קו מפריד: גם להם מציירים מסגרת <b>"ריהוט הדף"</b> — גם כשהמחשב כבר זיהה אותם (הם מסומנים <b>באפור</b>): מהמסגרות שלכם המחשב לומד לזהות ריהוט בעמודים הבאים. את הטקסט של הריהוט לא צריך להגיה — הוא לא נכנס לספר.
[[איור:ריהוט]]</li>
<li><b>כותרת פרק או סעיף</b> (גם בתוך ההערות) — לא מסגרת נפרדת. היא חלק מהטקסט, בתוך המסגרת של הזרם שלה, ומסמנים אותה בשלב הטקסט בסגנון-הפסקה <b>"כותרת"</b> (בתפריט "סגנון פסקה").</li>
<li><b>שורה שחתוכה לא נכון</b> (חצי שורה, שתי שורות בתיבה אחת, שורה שלא סומנה) — במצב "שורות": פיצול, איחוד או שורה חדשה.
<p>כשמסיימים — <b>"[[כפתור:finish]]"</b> (ואם אין מה לתקן: <b>"[[כפתור:skip]]"</b>, בפס שמעל העורך) ועוברים מיד לשלב הטקסט. אם תיקנתם את חיתוך השורות, הכפתור הוא <b>"[[כפתור:finishRecut]]"</b>: העמוד נשלח לזיהוי-מחדש, נעול עד שיזוהה, וחוזר אליכם לשלב הטקסט (תראו אותו ב"העמודים שלי"). אם אי אפשר לשלוח אותו בלי מנהל, הכפתור הוא <b>"[[כפתור:finishAsk]]"</b>: העמוד ממתין לאישור מנהל, נעול גם הוא. בינתיים אפשר לתפוס עמודים אחרים — עמוד שממתין אינו נספר בעמודים שאתם מחזיקים.</p>
<p class="note">חיתוך תקין אבל הטקסט שגוי — <b>לא</b> מתקנים את החיתוך: מתקנים את הטקסט בשלב 2.</p>
[[איור:פיצול]]</li>
</ol>
<p class="muted">רוצים לראות את הסריקה נקייה, בלי המסגרות והתיבות? בסריקה — <b>"בלי סימונים"</b> (ולחיצה נוספת מחזירה אותם). הזום — בכפתורי הזום או ב-<kbd>Ctrl</kbd>+גלגלת.</p>
</section>

<section id="text">
<h2><span class="material-symbols-outlined">edit_note</span>שלב 2: הטקסט</h2>
<ol>
<li><b>מקלידים מה שכתוב בדף.</b> אות שבורה שעוד רואים מה היא — מקלידים את האות הנכונה.</li>
<li><b>פגם בדפוס</b> (אות אחרת מהנכונה, נקודה במקום אות, אות חסרה) — מתקנים למה שאמור להיות כתוב, ומדליקים בסרגל <b>"פגם בדפוס"</b>: כשהמצב דולק, כל תיקון-טקסט נכנס לספר, אבל השורה לא משמשת לאימון המחשב.</li>
<li><b>נקודה מיוחדת</b> (מעוינת, מוגבהת) = נקודה רגילה.</li>
<li><b>מספר סעיף</b> — מודגש (B), <b>בלי</b> גרשיים, כמו במקור. כשבאותה שורה יש גם דיבור-המתחיל: המספר מודגש, והפסקה — "דיבור המתחיל".
[[איור:מספר-סעיף]]</li>
<li><b>מילה מודגשת או גדולה</b> בתוך המשפט — סגנון-תו (B או A+), לא מסגרת ולא שורה נפרדת.</li>
<li><b>פסקאות:</b> <kbd>Enter</kbd> = פסקה חדשה; <kbd>Backspace</kbd> בתחילת פסקה = חיבור לקודמת.</li>
<li><b>אישור:</b> ✓ ליד הפסקה (או <kbd>Ctrl+Enter</kbd>) = "בדקתי, הטקסט נכון".</li>
<li><b>בסוף:</b> <b>"הגשת העמוד"</b> — משלב הטקסט. צריך לתקן עוד מסגרת או שורה? <b>"[[כפתור:back]]"</b> — הטקסט שתיקנתם נשאר.</li>
<li><b>עמוד שמתנדב אחר כבר עבד עליו</b> (או עמוד שנפתח מחדש אחרי אישור) — מגיע עם התיקונים שלו, מסומנים בקו מנוקד (בריחוף — הטקסט המקורי). תיקון שגוי — בלוח הפרטים ← "שינויים" ← <b>"החזר למקור"</b>.</li>
</ol>
</section>

<section id="links">
<h2><span class="material-symbols-outlined">link</span>קישורים</h2>
<ul>
<li><b>יוצרים:</b> מסמנים מילה (ציון ההערה) ← "קישור" (<kbd>Ctrl+K</kbd>) ← עוברים לזרם השני ומסמנים את המילה המקבילה ← שוב "קישור".</li>
<li><b>קישור שגוי</b> — גם כזה שהמחשב יצר, וגם כזה שמתנדב יצר: לוחצים על המספר הקטן שאחרי המילה (①) ← <b>"בטל קישור"</b>. אותו כפתור יש גם בלוח הפרטים ← "קישורים". התחרטתם — שם, ב"קישורים שבוטלו": <b>"החזר לאוטומטי"</b>.</li>
</ul>
[[איור:בטל-קישור]]
</section>

<section id="time">
<h2><span class="material-symbols-outlined">schedule</span>זמנים</h2>
<ul>
<li>עמוד שתפסתם שמור לכם <b>[[ערך:שעות]] שעות</b> (שבת וחג אינם נספרים), וכל פתיחה מחדשת את הזמן. אפשר להחזיק עד [[ערך:עמודים]] עמודים בבת אחת; עד מתי כל עמוד שמור — ב"העמודים שלי".</li>
<li>עמוד שהגשתם מופיע ב"העמודים שלי" כ<b>"[[ערך:הוגש]]"</b>: אין צורך לעשות דבר, והוא כבר לא תופס מקום מהעמודים שאתם מחזיקים.</li>
<li>עמוד שנשלח לזיהוי-מחדש (או ממתין לאישור מנהל) נעול, וחוזר אליכם כשהמחשב של המנהל מעבד אותו. הוא אינו תופס מקום מהעמודים שאתם מחזיקים.</li>
</ul>
</section>

<section id="questions">
<h2><span class="material-symbols-outlined">forum</span>שאלות</h2>
<p>באשכול בפורום — עם צילום של העמוד.</p>
<p><a href="/library/page-proof">לדף הגהת העמודים</a></p>
</section>
`;

// הניקוי — רשימת-היתר בלבד (גם מה שנשמר מדף הניהול מוצג בדף ציבורי)
const SANITIZE = Object.freeze({
  allowedTags: ['section', 'h2', 'h3', 'p', 'ol', 'ul', 'li', 'b', 'strong', 'i', 'em', 'u', 'kbd', 'br', 'a', 'span'],
  allowedAttributes: { section: ['id'], h2: ['id'], h3: ['id'], a: ['href'], p: ['class'], span: ['class'] },
  allowedClasses: { p: ['note', 'muted', 'lead'], span: ['material-symbols-outlined'] },
  allowedSchemes: ['http', 'https'],
  allowedSchemesAppliedToAttributes: ['href'],
  allowProtocolRelative: false,
  disallowedTagsMode: 'discard',
  // תווי-בקרה ומזהים: רק אותיות לטיניות, ספרות ומקף — מזהה-פרק הוא חלק מכתובת (#structure)
  transformTags: {
    a: (tagName, attribs) => ({ tagName, attribs: { href: attribs.href || '#' } }),
  },
  exclusiveFilter: (frame) => frame.tag === 'a' && !/^(https?:\/\/|\/(?!\/))/.test(frame.attribs?.href || ''),
});

const ID_RE = /^[A-Za-z][A-Za-z0-9-]{0,40}$/;

// ← HTML נקי. מזהה-פרק שאינו תקין יורד
export function sanitizeGuideHtml(html) {
  const clean = sanitizeHtml(String(html ?? ''), SANITIZE);
  return clean.replace(/ id="([^"]*)"/g, (m, id) => (ID_RE.test(id) ? m : ''));
}

// בדיקת קלט לשמירה: {html} (נקי) או {error} בעברית
export function guideInput(raw) {
  if (typeof raw !== 'string') return { error: 'התוכן חסר' };
  if (raw.length > MAX_GUIDE_HTML) return { error: `התוכן ארוך מדי (עד ${Math.round(MAX_GUIDE_HTML / 1024)}KB)` };
  const html = sanitizeGuideHtml(raw).trim();
  if (!html) return { error: 'אחרי הניקוי לא נשאר תוכן' };
  if (!/<h2[\s>]/.test(html)) return { error: 'חסרה לפחות כותרת-פרק אחת (<h2>)' };
  return { html };
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const stripTags = (s) =>
  String(s)
    .replace(/<span class="material-symbols-outlined">[^<]*<\/span>/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .trim();

// מה שהדף מציג: HTML נקי → {html, toc, unknown} — הקודים מוחלפים (איור ← מקום-שמור שהדף ממלא; כפתור/ערך ← הנוסח),
// ותוכן-הדף נבנה מהפרקים שיש להם id. unknown — קודים שלא הוכרו (נשארים כמו שהם; העורך מזהיר עליהם)
export function renderGuide(html) {
  const unknown = [];
  let out = sanitizeGuideHtml(html);
  out = out.replace(/\[\[(איור|כפתור|ערך):([^\]]{1,40})\]\]/g, (m, kind, key) => {
    const k = key.trim();
    if (kind === 'איור' && GUIDE_FIGURES[k]) return `<span data-guide-figure="${esc(k)}"></span>`;
    if (kind === 'כפתור' && GUIDE_BUTTONS.includes(k) && typeof STAGE_TEXT[k] === 'string') return esc(STAGE_TEXT[k]);
    if (kind === 'ערך' && GUIDE_VALUES[k] !== undefined) return esc(GUIDE_VALUES[k]);
    unknown.push(m);
    return m;
  });
  const toc = [];
  const re = /<section id="([^"]+)">\s*<h2[^>]*>([\s\S]*?)<\/h2>/g;
  let m;
  while ((m = re.exec(out))) toc.push({ href: `#${m[1]}`, label: stripTags(m[2]) });
  return { html: out, toc, unknown: [...new Set(unknown)] };
}

// רשימת הקודים לעורך (בדף הניהול)
export function guideCodes() {
  return {
    figures: Object.keys(GUIDE_FIGURES).map((k) => `[[איור:${k}]]`),
    buttons: GUIDE_BUTTONS.map((k) => ({ code: `[[כפתור:${k}]]`, text: STAGE_TEXT[k] })),
    values: Object.entries(GUIDE_VALUES).map(([k, v]) => ({ code: `[[ערך:${k}]]`, text: v })),
  };
}
