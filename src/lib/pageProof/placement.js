// מיקום שורה חדשה בסדר-הקריאה — מודע-טורים. שורה שנוספה או פוצלה על הסריקה
// נכנסת ליד השורות של *הטור שלה*, ולא אחרי השורה הגבוהה ביותר בעמוד כולו
// (בעמוד דו-טורי זה היה משבץ את חצי-השורה השמאלי באמצע הטור הימני).
// טהור ודטרמיניסטי — אותה תוצאה בלקוח ובשרת, ובכל חישוב-מחדש של התצוגה.

import { isFurnitureStream } from './vocab.js';

// חפיפה אופקית מינימלית (מתוך הרוחב הצר מבין השתיים) כדי להיחשב "אותו טור"
export const COLUMN_OVERLAP = 0.3;

const midY = (b) => (b[1] + b[3]) / 2;
const width = (b) => b[2] - b[0];
const isBox = (b) => Array.isArray(b) && b.length === 4 && b.every(Number.isFinite);
const hasOrder = (l) => Number.isFinite(l?.order);
const liveLines = (lines) => (lines || []).filter((l) => l && isBox(l.bbox) && l.status !== 'removed');
const overlapX = (a, b) => Math.min(a[2], b[2]) - Math.max(a[0], b[0]);

// "הדיקות" האופקית של שכנה (0–1): חפיפה מתוך הרוחב *הרחב* מבין השתיים.
// שורה ברוחב הטור = 1; כותרת/הערה שפרושה על שני טורים מעל חצי-שורה ≈ 0.5.
function tightness(line, bbox) {
  const w = Math.max(width(line.bbox), width(bbox));
  return w > 0 ? Math.max(0, overlapX(line.bbox, bbox)) / w : 0;
}

// השורות שבאותו טור כמו התיבה: חפיפה אופקית ≥ 30% מהרוחב הצר מבין השתיים.
// שורות שהוסרו (לא-שורה) ושורות בלי תיבה אינן נספרות.
export function columnOf(lines, bbox) {
  if (!isBox(bbox)) return [];
  return liveLines(lines).filter((l) => {
    const w = Math.min(width(l.bbox), width(bbox));
    return w > 0 && overlapX(l.bbox, bbox) >= COLUMN_OVERLAP * w;
  });
}

// השכנה הקרובה ביותר מעל (מרכזה ≤ מרכז התיבה) ומתחת. שוויון בגובה: מעל —
// זו שמאוחרת בסדר; מתחת — זו שמוקדמת בסדר.
function neighbours(pool, bbox) {
  const c = midY(bbox);
  let above = null;
  let below = null;
  for (const l of pool) {
    const y = midY(l.bbox);
    if (y <= c) {
      const ya = above && midY(above.bbox);
      if (!above || y > ya || (y === ya && l.order > above.order)) above = l;
    } else {
      const yb = below && midY(below.bbox);
      if (!below || y < yb || (y === yb && l.order < below.order)) below = l;
    }
  }
  return { above, below };
}

// סדר-הקריאה שבין o לבא אחריו (בכל העמוד — כדי שהמספר יהיה ייחודי)
function after(orders, o) {
  const next = orders.find((x) => x > o);
  return next === undefined ? o + 0.5 : (o + next) / 2;
}

function before(orders, o) {
  let prev;
  for (const x of orders) if (x < o) prev = x;
  return prev === undefined ? o - 0.5 : (prev + o) / 2;
}

const ordersOf = (lines) => [...new Set((lines || []).filter(hasOrder).map((l) => l.order))].sort((a, b) => a - b);

// מספר-סדר ייחודי מיד אחרי o (אמצע הדרך לסדר הבא בין השורות)
export function orderAfter(lines, o) {
  return after(ordersOf(lines), o);
}

// מספר סדר-קריאה לשורה חדשה בתיבה bbox:
// • באותו טור — אחרי השורה הקרובה שמרכזה מעל מרכז התיבה (אמצע הדרך בינה
//   לבין הסדר הבא בעמוד, כדי לשמור על ייחודיות), ואם אין — לפני השורה
//   הראשונה שמתחתיה בטור;
// • כששתי השכנות קיימות אבל אינן עוקבות בסדר-הקריאה (יש ביניהן טור אחר) —
//   מכריעה השכנה ה"הדוקה" יותר לרוחב: חצי-שורה בטור השמאלי שמתחת לכותרת
//   הפרושה על שני הטורים נכנס לפני השורה הבאה בטור שלו, ולא אחרי הכותרת
//   (שם הוא היה נקרא לפני כל הטור הימני). בשוויון — "אחרי השורה שמעל";
// • טור ריק — אותו כלל לפי מרכז אנכי בין כל השורות בעמוד;
// • אין שורות בכלל — 1.
export function placeOrder(lines, bbox) {
  const orders = ordersOf(lines);
  if (!orders.length) return 1;
  if (!isBox(bbox)) return orders[orders.length - 1] + 0.5;
  let pool = columnOf(lines, bbox).filter(hasOrder);
  if (!pool.length) pool = liveLines(lines).filter(hasOrder);
  if (!pool.length) return orders[orders.length - 1] + 0.5;

  const { above, below } = neighbours(pool, bbox);
  if (above && below) {
    const a = after(orders, above.order);
    const b = before(orders, below.order);
    if (a === b || tightness(above, bbox) >= tightness(below, bbox)) return a;
    return b;
  }
  return above ? after(orders, above.order) : before(orders, below.order);
}

// הזרם לשורה חדשה: של השורה הקרובה ביותר (במרחק אנכי) באותו טור. שורות-תוכן
// קודמות לשורות-ריהוט (שורה שנשכחה בראש הטור אינה "כותרת-עמוד" רק בגלל
// שהכותרת-הרצה קרובה אליה). בלי _heading — שורה חדשה היא טקסט רגיל, והכותרת
// נקבעת בסגנון-הפסקה. טור ריק — 'main'.
export function neighbourStream(lines, bbox) {
  if (!isBox(bbox)) return 'main';
  const col = columnOf(lines, bbox);
  const content = col.filter((l) => !isFurnitureStream(l.stream));
  const pool = content.length ? content : col;
  if (!pool.length) return 'main';
  const c = midY(bbox);
  let best = null;
  let bestKey = null;
  for (const l of pool) {
    const y = midY(l.bbox);
    // מרחק, ואז הדוקה יותר, ואז מעל לפני מתחת, ואז לפי הסדר
    const key = [Math.abs(y - c), -tightness(l, bbox), y <= c ? 0 : 1, Number.isFinite(l.order) ? l.order : Infinity];
    if (!best || lessThan(key, bestKey)) {
      best = l;
      bestKey = key;
    }
  }
  return String(best.stream || 'main').replace(/_heading$/, '') || 'main';
}

function lessThan(a, b) {
  for (let i = 0; i < a.length; i++) {
    if (a[i] < b[i]) return true;
    if (a[i] > b[i]) return false;
  }
  return false;
}
