// פונקציות טהורות של runOcrJob.js — ללא DB/fs/network — מופרדות כדי שניתן
// יהיה לבדוק אותן ביחידה.

// בודק האם עמוד כבר מכיל טקסט כלשהו (תוכן ראשי או טורים).
export function pageHasText(p) {
  return !!(p.content?.trim() || p.rightColumn?.trim() || p.leftColumn?.trim());
}

// העדכון שנכתב לעמוד לאחר OCR: הטקסט מחליף את התוכן, והטורים מתאפסים
// (פלט ה-OCR הוא טקסט יחיד). במצב "דלג" ממילא נוגעים רק בעמודים ריקים.
export function buildPageUpdate(text) {
  return {
    content: text,
    rightColumn: '',
    leftColumn: '',
    isTwoColumns: false,
  };
}
