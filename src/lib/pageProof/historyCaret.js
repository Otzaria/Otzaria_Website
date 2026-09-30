// איפה הסמן אחרי ביטול/חזרה (Ctrl+Z / Ctrl+Y) בעורך הגהת-העמודים: במקום
// שבו הטקסט השתנה, כמו בכל עורך — ולא בתחילת המילה (הדפדפן מאפס את הסמן
// כשהטקסט של הצומת מוחלף). לוגיקה טהורה.

// המקום שבו הטקסט השתנה: אחרי החלק שנוסף, או במקום החלק שנמחק. null אם זהים.
export function textChangeCaret(oldText, newText) {
  const a = String(oldText ?? '');
  const b = String(newText ?? '');
  if (a === b) return null;
  let p = 0;
  while (p < a.length && p < b.length && a[p] === b[p]) p++;
  let s = 0;
  while (s < a.length - p && s < b.length - p && a[a.length - 1 - s] === b[b.length - 1 - s]) s++;
  return b.length - s;
}

// before/after = התצוגה לפני ואחרי; ops = הפעולות שבוטלו/חזרו. מחזיר מקום-סמן
// {lineId, offset} בשורה הראשונה (לפי סדר הפעולות) שהטקסט שלה השתנה, או null.
export function historyCaret(before, after, ops) {
  const lineOf = (view, id) => (view?.lines || []).find((l) => l?.id === id && l.status !== 'removed') || null;
  for (const op of ops || []) {
    if (op?.kind !== 'text' || !Array.isArray(op.ids)) continue;
    for (const id of op.ids) {
      const b = lineOf(before, id);
      const a = lineOf(after, id);
      if (!a) continue;
      const at = textChangeCaret(b?.text, a.text);
      if (at != null) return { lineId: id, offset: at };
    }
  }
  return null;
}
