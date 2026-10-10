// "בטל קישור" ו"החזר לאוטומטי" — הלוגיקה הטהורה של לוח הקישורים (LinksTab) ושל החלונית שנפתחת מהמספר
// שליד המילה בטקסט (LinkPopover). בעל הפרויקט, 2026-10-05 (ח-4א): מתנדבים לא מצאו איך מבטלים קישור
// שהמחשב יצר, וגם קישור שמתנדב יצר לא היה אפשר לבטל. הכלל — לכל קישור בעמוד:
//
//   • קישור שנוסף בעריכה הזו (_added — בעמוד הזה או לעמוד אחר): פעולת ה-link_add עצמה יורדת, צעד-ביטול
//     אחד. *לא* link_del: הם היו נשלחים יחד לתוכנת-הספר — קישור ידני ומיד אחריו "אין קישור". אבל אם הקישור
//     החדש **החליף** קישור חי מאותה שורה שהגיע עם העמוד (לכל שורת-הערה קישור אחד) — באותו צעד גם link_del
//     לקישור ההוא: אחרת "בטל קישור" היה מחזיר בשקט את הקישור הישן (ביקורת, 2026-10-05).
//   • קישור שהגיע עם העמוד — אוטומטי, או ידני (של מתנדב קודם או של בעל הפרויקט): link_del {src_line, page}.
//     בתוכנת-הספר נרשם "אין קישור" ידני, והגזירה האוטומטית לא תחזיר אותו.
//   • קישור שהפירוש שלו בעמוד אחר (from_page): מבטלים אותו בעמוד ההוא — שורת-המקור שם; כאן רק הסבר.
//
// "החזר לאוטומטי" — לקישור שבוטל:
//   • בעריכה הזו (link_del שעוד לא נשלח): הפעולה יורדת, והקישור חוזר כמו שהיה. לקישור אוטומטי — "החזר
//     לאוטומטי"; לקישור ידני — "החזר את הקישור" (הוא לא היה אוטומטי).
//   • קודם ("אין קישור" שהגיע עם העמוד — flowEdit.isCancelledLink): link_reset {src_line, page} — ההכרעה
//     הידנית יורדת, והמחשב קובע שוב (ואולי מוצא את הקישור). "יחזור לאוטומטי" עד שהעמוד חוזר מתוכנת-הספר.

import { tokenize } from './textModel.js';
import { farLabel, isCancelledLink } from './flowEdit.js';
import { sameLinkSlot, linkOpValue } from './ops.js';

export { isCancelledLink };

// הנוסחים — בלוח הקישורים, בחלונית ובשורת-המצב
export const LINK_HE = Object.freeze({
  unlink: 'בטל קישור',
  unlinkTitle: 'הקישור שגוי או מיותר — הוא יבוטל (Ctrl+Z מחזיר)',
  restoreAuto: 'החזר לאוטומטי',
  restoreAutoTitle: 'הקישור חוזר לידי המחשב: הוא יקבע אותו מחדש',
  restoreHuman: 'החזר את הקישור',
  restoreHumanTitle: 'הקישור חוזר כמו שהיה לפני הביטול',
  cancelled: 'הקישור בוטל — "החזר לאוטומטי" בלוח הפרטים ← קישורים (או Ctrl+Z)',
  cancelledAdded: 'הקישור בוטל (Ctrl+Z מחזיר אותו)',
  restored: 'הקישור הוחזר',
  resetQueued: 'הקישור יחזור לאוטומטי: המחשב יקבע אותו מחדש',
  resetUndone: 'הקישור נשאר מבוטל',
  farHint: (page) => `הפירוש של הקישור הזה בעמוד ${page} — מאשרים או מבטלים אותו שם`,
});

const KIND_HE = { note: 'הערה', dh: 'דיבור-המתחיל', join: 'המשך', side: 'הערת-צד' };
export const linkKindHe = (k) => KIND_HE[k?.kind] || k?.kind || 'קישור';

// מצב הקישור בשתי מילים: "אושר" (ידני) / "אוטומטי 85%"
export function linkSourceHe(k) {
  if (k?.src === 'human') return 'אושר';
  return `אוטומטי${typeof k?.conf === 'number' ? ` ${Math.round(k.conf * 100)}%` : ''}`;
}

// הקישור הגיע מעמוד אחר (הפירוש שם) — מבטלים/מאשרים אותו שם
export const isIncomingFar = (k, page) => k?.from_page != null && k.from_page !== page;

// התווית של קצה-קישור: "3: «מילים»" (מספר-השורה והמילים שבטווח), או "3: תחילת השורה…"; קצה בעמוד אחר —
// "עמוד 4, שורה 12: «…»"; שורה שאינה בתצוגה — "שורה N"
export function linkEndLabel(view, side, k) {
  const page = view?.page;
  const far = side === 'from' ? isIncomingFar(k, page) : k?.to_page != null && k.to_page !== page;
  if (far) {
    return side === 'from'
      ? farLabel(k.from_page, k.from_line_no, k.from_line, k.from_text)
      : farLabel(k.to_page, k.to_line_no, k.to_line, k.to_text);
  }
  const id = side === 'from' ? k?.from_line : k?.to_line;
  const range = side === 'from' ? k?.from_words : k?.to_words || k?.words;
  const l = (view?.lines || []).find((x) => x && x.id === id);
  if (!l) return `שורה ${id}`;
  const no = (l.line_no ?? 0) + 1;
  if (Array.isArray(range)) {
    const ws = tokenize(l.text).filter((t) => t.w === 'word');
    const w = ws
      .slice(range[0], range[1] + 1)
      .map((t) => t.text)
      .join(' ');
    if (w) return `${no}: «${w}»`;
  }
  const t = String(l.text || '');
  return `${no}: ${t.slice(0, 28)}${t.length > 28 ? '…' : ''}`;
}

// "בטל קישור" ← מה לעשות:
//   {action: 'remove', match(op)} — להוריד את פעולת ה-link_add (נוסף בעריכה הזו)
//   {action: 'op', op}            — link_del לתוכנת-הספר
//   {action: 'far', hint}         — הפירוש בעמוד אחר: שם מבטלים
//   {action: 'none'}              — אין מה לבטל (קישור שכבר בוטל)
//   remove יכול לבוא עם add: [link_del] — הקישור שהגיע עם העמוד מאותה שורה ושהקישור החדש החליף (baseDoc)
export function unlinkPlan(view, k, page = view?.page, baseDoc = null) {
  if (!k || isCancelledLink(k)) return { action: 'none' };
  if (k._added) {
    // כמה קישורים לשורת-הערה (2026-10-04): הקישור החדש החליף רק קישור שהטווח שלו חופף (sameLinkSlot), ורק אותו מבטלים
    const replaced = (baseDoc?.links || []).find(
      (b) => sameLinkSlot(b, k.from_line, k.from_words) && !isCancelledLink(b) && !isIncomingFar(b, page)
    );
    return {
      action: 'remove',
      match: (op) =>
        op?.kind === 'link_add' && op.ids?.[0] === k.from_line && op.ids?.[1] === k.to_line && sameLinkSlot(k, op.ids[0], op.value?.from_words),
      add: replaced ? [{ kind: 'link_del', page, value: linkOpValue(baseDoc, k.from_line, replaced, page) }] : [],
    };
  }
  if (isIncomingFar(k, page)) return { action: 'far', hint: LINK_HE.farHint(k.from_page) };
  // בשורה שיש בה כמה קישורים — רק הקישור הזה (from_words), ולא כל קישורי השורה
  return { action: 'op', op: { kind: 'link_del', page, value: linkOpValue(view, k.from_line, k, page) } };
}

// הקישורים שבוטלו, לרשימה "קישורים שבוטלו" בלוח הקישורים:
// [{key, link, when: 'now' | 'before', auto, label, restore}] —
//   when 'now'    — link_del בעריכה הזו על קישור שהגיע עם העמוד; restore = {action: 'remove', match} (הפעולה יורדת)
//   when 'before' — "אין קישור" שהגיע עם העמוד; restore = {action: 'op', op: link_reset}, או — כשההחזרה כבר
//                   בדרך (link_reset בעריכה הזו) — pending: true ו-restore = {action: 'remove', match} (לבטל אותה)
// קישור שנוצר מחדש מאותה שורה (link_add אחרי הביטול) — אינו "מבוטל" ואינו ברשימה.
// baseDoc — העמוד שיובא; ops — הפעולות (בלי המקומיות); view — buildView(baseDoc, ops).
export function cancelledLinks(baseDoc, ops, view) {
  const page = view?.page ?? baseDoc?.page;
  const live = new Set((view?.links || []).filter((k) => k && !isCancelledLink(k)).map((k) => k.from_line));
  const base = (baseDoc?.links || []).filter(Boolean);
  const out = [];
  const seen = new Set();
  // בעריכה הזו: link_del על קישור (לא מבוטל) שהגיע עם העמוד
  for (const op of ops || []) {
    if (op?.kind !== 'link_del') continue;
    const src = op.value?.src_line;
    if (seen.has(src) || live.has(src)) continue;
    const b = base.find((k) => k.from_line === src && !isCancelledLink(k));
    if (!b) continue;
    seen.add(src);
    out.push({
      key: `now:${src}`,
      link: b,
      when: 'now',
      auto: b.src !== 'human',
      label: linkEndLabel(view, 'from', b),
      restore: { action: 'remove', match: (o) => o?.kind === 'link_del' && o.value?.src_line === src },
    });
  }
  // קודם: "אין קישור" שהגיע עם העמוד
  for (const b of base) {
    if (!isCancelledLink(b) || seen.has(b.from_line) || live.has(b.from_line)) continue;
    if (b.from_page != null && b.from_page !== page) continue;
    seen.add(b.from_line);
    const src = b.from_line;
    const vk = (view?.links || []).find((k) => k && k.from_line === src);
    const pending = !!vk?._reset || (ops || []).some((o) => o?.kind === 'link_reset' && o.value?.src_line === src);
    out.push({
      key: `before:${src}`,
      link: b,
      when: 'before',
      auto: true,
      pending,
      label: linkEndLabel(view, 'from', b),
      restore: pending
        ? { action: 'remove', match: (o) => o?.kind === 'link_reset' && o.value?.src_line === src }
        : { action: 'op', op: { kind: 'link_reset', page, value: { src_line: src, page } } },
    });
  }
  return out;
}
