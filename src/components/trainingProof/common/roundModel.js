// המצב של סבב בדפדפן (טהור): השורות, מה סומן, וההתקדמות. "דלג" מחזיר את השורה
// למאגר בשרת, אבל בסבב שעל המסך היא נשארת (skipped) — כדי שהמתנדב יראה מה דילג
// ושהספירה "N מתוך 30" תגיע ל-30 (docs/75 "גם דלג נחשב").

export const isHandled = (it) => it.skipped || it.status === 'submitted' || it.status === 'approved';

export function progress(items) {
  return { done: items.filter(isHandled).length, total: items.length };
}

// אחרי שמירה מוצלחת: הפריט כפי שחזר מהשרת, או סימון "דילגתי"
export function applySaved(items, id, { item, skipped }) {
  return items.map((it) => {
    if (it.id !== id) return it;
    if (skipped) return { ...it, skipped: true, status: 'available', result: { action: 'skip' } };
    return { ...item, skipped: false };
  });
}

// מספר לפי פעולה — לסיכום בסוף הסבב בזיהוי
export function countBy(items, key) {
  const out = {};
  for (const it of items) {
    const k = it.skipped ? 'skip' : key(it);
    if (k) out[k] = (out[k] || 0) + 1;
  }
  return out;
}

// השורה הבאה שעוד לא טופלה אחרי i (או הבאה בתור, אם הכול טופל)
export function nextIndex(items, i) {
  for (let j = i + 1; j < items.length; j++) if (!isHandled(items[j])) return j;
  return Math.min(i + 1, items.length - 1);
}

// מקש מהמקלדת שלא ייתפס כשהמתנדב מקליד (שדה טקסט, עריכה)
export function isTypingTarget(el) {
  if (!el) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable === true;
}
