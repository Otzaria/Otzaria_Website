// סוג הזרם קובע את התפקיד של המסגרות שלו — טהור (בלי DOM), משותף לעורך, לשרת ולבדיקות.
//
// כמו בתחנת-המסגרות (src/station/frames.js setStream/setRole; frames/desk.py frames_streams — docs/69 §8.3):
// * לכל זרם יש סוג אחד (role ברשימת-הזרמים של הספר, books.json — docs/76 §4.3). מסגרת-טקסט בזרם מקבלת
//   את הסוג שלו, ושינוי הסוג של הזרם משנה את כל המסגרות שלו.
// * "כיתוב" הוא תפקיד של המסגרת בתוך הזרם — נשאר גם כשהזרם מסוג אחר. "כותרת" כבר לא תפקיד (2026-11-01,
//   docs/69 §8.15): כותרת היא חלק ממסגרת הזרם שהיא פותחת, ולכן מסגרת "כותרת" ישנה בזרם מקבלת את הסוג שלו.
// * ריהוט ואובייקט — בלי זרם. מסגרת-טקסט בלי זרם שומרת את התפקיד שלה.
// * זרם שנוסף באתר יוצא לתחנה ב-streams_added עם הסוג העדכני. זרם שהגיע מהתחנה ושהסוג שלו שונה באתר — יוצא
//   ב-streams_changed ({id, role, from}; docs/76 §5.3, שדה רשות מ-2026-11-01). from = הסוג שהגיע מהתחנה (stationRole
//   ברשימת-הזרמים של הספר), כדי שהתחנה לא תדרוס שינוי שנעשה שם מאז הייצוא.

import { withRole, NO_STREAM_ROLES } from './geometry.js';

// הסוגים שזרם יכול להיות (כמו STREAM_ROLES בתחנה, frames.js)
export const STREAM_KINDS = ['body', 'commentary', 'notes', 'margin', 'box', 'caption'];
// תפקידים של מסגרת בתוך הזרם שלה — לא נדרסים בסוג הזרם
export const IN_STREAM_ROLES = ['caption'];

const byIdOf = (streams) => new Map((streams || []).map((s) => [s.id, s]));

// זרם שהגיע מהתחנה ושהסוג שלו שונה באתר
export const kindChanged = (s) => !s?.added && !!s?.stationRole && s.stationRole !== s.role;

// הזרמים שהסוג שלהם שונה באתר, כפי שהם יוצאים ב-streams_changed
export const changedStreams = (streams) =>
  (streams || []).filter(kindChanged).map((s) => ({ id: s.id, role: s.role, from: s.stationRole }));

// התפקיד של מסגרת לפי הזרם שלה. byId = Map(id → זרם)
export function frameRoleFor(f, byId) {
  if (!f || f.kind === 'object' || NO_STREAM_ROLES.includes(f.role) || IN_STREAM_ROLES.includes(f.role)) return f?.role;
  const s = f.stream ? byId.get(f.stream) : null;
  return s?.role && STREAM_KINDS.includes(s.role) ? s.role : f.role;
}

// כל המסגרות עם התפקיד שהזרם שלהן קובע. מחזיר את אותו מערך כשאין שינוי (כדי לדעת אם לרנדר/לשמור)
export function syncRoles(frames, streams) {
  const byId = byIdOf(streams);
  let changed = false;
  const out = (frames || []).map((f) => {
    const role = frameRoleFor(f, byId);
    if (role === f.role) return f;
    changed = true;
    return { ...f, role };
  });
  return changed ? out : frames;
}

// מקש/כפתור של תפקיד (1–9) על מסגרת. סוג של זרם (גוף, פירוש…) = "תעבור לזרם מהסוג הזה": אם הזרם שלה
// כבר מהסוג — רק התפקיד; אחרת הזרם הראשון בספר מהסוג הזה, ובלעדיו — בלי זרם. כיתוב — הזרם נשאר.
export function applyRole(f, role, streams, opts) {
  const g = withRole(f, role, opts);
  if (g === f || g.kind === 'object' || NO_STREAM_ROLES.includes(g.role) || IN_STREAM_ROLES.includes(g.role)) return g;
  const byId = byIdOf(streams);
  if (byId.get(f.stream)?.role === role) return g;
  const st = (streams || []).find((s) => s.role === role);
  return { ...g, stream: st ? st.id : null };
}

// בחירת זרם למסגרת: היא מקבלת ממנו את הסוג (חוץ מכיתוב). id = null — בלי זרם, התפקיד נשאר
export function applyStream(f, id, streams) {
  const g = { ...f, stream: id ?? null, src: 'human' };
  return { ...g, role: frameRoleFor(g, byIdOf(streams)) };
}

// כמה מסגרות וכמה עמודים בזרם. pages = [{frames}]
export function streamUsage(pages, id) {
  let frames = 0;
  let n = 0;
  for (const p of pages || []) {
    const k = (p.frames || []).filter((f) => f.stream === id).length;
    frames += k;
    if (k) n += 1;
  }
  return { frames, pages: n };
}

// שינוי הסוג של זרם ברשימת-הזרמים של הספר: body = {role}. מחזיר {streams, stream, from} או {error}
export function checkStreamKind(streams, id, body) {
  const s = (streams || []).find((x) => x.id === id);
  if (!s) return { error: 'הזרם לא נמצא בספר' };
  const role = body?.role;
  if (!STREAM_KINDS.includes(role)) return { error: 'סוג לא מתאים לזרם' };
  const next = streams.map((x) => (x.id === id ? { ...x, role } : x));
  return { streams: next, stream: { ...s, role }, from: s.role };
}
