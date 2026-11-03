// הצורה של פריט שנשלחת לדפדפן של המתנדב — טהור. בלי מפתח-הספר (book), בלי
// ביטחון המודל (conf — "לא מוצג למתנדב", docs/76 §4.1) ובלי מזהי-תחנה. התמונה
// מוגשת דרך נתיב מוגן (ההרשאה נבדקת בכל בקשה), לא כנכס סטטי.

export const itemImageUrl = (id) => `/api/training-proof/items/${id}/image`;
export const itemCtxUrl = (id) => `/api/training-proof/items/${id}/ctx`;

// העמוד המלא לכפתור "הצג בעמוד המלא" (ocr — §4.1, router — §4.2), דרך הנתיב המוגן
const ctxOf = (d) => (d.ctxPath && d.payload?.ctx?.bbox ? { img: itemCtxUrl(String(d._id)), bbox: d.payload.ctx.bbox } : null);

function common(d) {
  const p = d.payload || {};
  return {
    id: String(d._id),
    section: d.section,
    img: itemImageUrl(String(d._id)),
    w: p.w,
    h: p.h,
    alias: p.alias || '',
    page: Number.isInteger(p.page) ? p.page : null,
    status: d.status,
    result: d.status === 'submitted' || d.status === 'approved' ? d.result || null : null,
  };
}

export function publicOcrItem(d) {
  const p = d.payload || {};
  return {
    ...common(d),
    track: p.track,
    source: p.source,
    text: p.text || '',
    lineNo: Number.isInteger(p.line_no) ? p.line_no : null,
    ctx: ctxOf(d),
  };
}

export function publicRouterItem(d) {
  const p = d.payload || {};
  return {
    ...common(d),
    pred: p.pred || null,
    predP: typeof p.pred_p === 'number' ? p.pred_p : null,
    text: p.text || '',
    words: Array.isArray(p.words)
      ? p.words.map((w) => ({ k: w.k, box: w.box, pred: w.pred || null, text: w.text || '' })).sort((a, b) => a.k - b.k)
      : null,
    ctx: ctxOf(d),
  };
}

export const PUBLIC_SHAPES = { ocr: publicOcrItem, router: publicRouterItem };

export function publicItem(d) {
  const f = PUBLIC_SHAPES[d.section];
  return f ? f(d) : common(d);
}
