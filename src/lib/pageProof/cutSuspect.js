// שורות חשודות בחיתוך — הסימון שתוכנת-הספר מצרפת לעמוד (`flags.cut_suspect` לכל שורה: רשימת סיבות; `cut_suspect`
// ברמת-העמוד), כדי שבשלב "מבנה" המתנדב ימצא את השורות השבורות בלי לקרוא את כל הטקסט (פורום, 2026-10-08: "קשה לזהות
// שורה שהיא בעצם שתיים או שנחתכה לשתיים"). לוגיקה טהורה.
//
// מה עוד חשוד: שורה שסומנה, שלא הוסרה ("לא-שורה"), שאיש לא נגע בחיתוך שלה (פיצול / איחוד / תיבה — `_recut`, או ממתינה
// לזיהוי-מחדש — recutSet), ושאינה חדשה. "✓ החיתוך בעמוד תקין" (cut_ok) — המתנדב בדק, ואין עוד חשודות.
// עמוד בלי השדה (חבילה ישנה) — אין חשודות, כמו קודם.

import { recutSet } from './scanGeometry.js';

// הסיבות כפי שתוכנת-הספר שולחת (cutsuspect.SHOWN שם), והנוסח שהמתנדב רואה
export const CUT_REASON_HE = Object.freeze({
  tall: 'כנראה שתי שורות בתיבה אחת — פצלו אותה',
  double: 'כנראה שתי שורות בתיבה אחת — פצלו אותה',
  giant: 'התיבה בלעה כמה שורות — פצלו אותה',
  frag: 'כנראה חלק משורה, ולצידה עוד חלק שלה — אחדו אותם',
  dup: 'חופפת תיבה אחרת — אותן מילים ייקראו פעמיים: אחת מהן "לא-שורה", או אחדו',
  cross: 'חוצה את הרווח שבין הטורים — פצלו אותה ברווח',
});

// תווית קצרה על הסריקה
export const CUT_REASON_SHORT = Object.freeze({
  tall: 'שתי שורות?',
  double: 'שתי שורות?',
  giant: 'כמה שורות?',
  frag: 'חלק משורה?',
  dup: 'כפולה?',
  cross: 'חוצה טורים?',
});

const reasonsOf = (l) => (Array.isArray(l?.flags?.cut_suspect) ? l.flags.cut_suspect.filter((r) => Object.hasOwn(CUT_REASON_HE, r)) : []);

// Map מזהה-שורה → [סיבות] — מה שעדיין חשוד בתצוגה (buildView). locked — שורות שממתינות לזיהוי-מחדש (כמו ב-ScanPanel)
export function cutSuspects(view, locked = null) {
  const out = new Map();
  if (!view || view.cut_ok) return out;
  const touched = recutSet(view.lines, locked);
  for (const l of view.lines || []) {
    if (!l || l._new || l.status === 'removed' || touched.has(l.id)) continue;
    const rs = reasonsOf(l);
    if (rs.length) out.set(l.id, rs);
  }
  return out;
}

// ההסבר לשורה (הסיבה הראשונה; כמה סיבות — מחוברות)
export function cutSuspectText(reasons) {
  const he = [...new Set((reasons || []).map((r) => CUT_REASON_HE[r]).filter(Boolean))];
  return he.join(' · ');
}

// החשודה הבאה בסדר-הקריאה (order) אחרי currentId — ובסוף חוזרים להתחלה; אין חשודות — null
export function nextCutSuspect(view, suspects, currentId = null) {
  if (!suspects || !suspects.size) return null;
  const list = (view?.lines || []).filter((l) => suspects.has(l.id)).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  if (!list.length) return null;
  const i = list.findIndex((l) => l.id === currentId);
  return list[(i + 1) % list.length].id;
}
