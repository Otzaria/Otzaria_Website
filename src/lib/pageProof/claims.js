import mongoose from 'mongoose';
// נתיבים יחסיים (לא '@/') — כדי שטסט-האינטגרציה (claims.int.test.mjs) ירוץ
// עם node:test מול MongoDB אמיתי, כמו importPackages.js
import PageProofBook from '../../models/PageProofBook.js';
import PageProofPage from '../../models/PageProofPage.js';
import PageProofSubmission from '../../models/PageProofSubmission.js';
import User from '../../models/User.js';
import { storedRevision, submissionRevision } from './importRules.js';
import { pageStateFor, bookCounts, claimRefusal, volunteerOpenFilter, CLAIM_HOURS, MAX_HELD } from './gridState.js';
import { leaseEnd } from './lease.js';
import { roundOf } from './reopenRules.js';

// בחירת עמודים בידי המתנדב (כמו "תפוס לעריכה" בספרים הישנים): רשימת הספרים
// עם מונים, רשת-העמודים של ספר, תפיסה/שחרור של עמוד או של רצף שלם, "העמודים
// שלי" (מה שהמתנדב מחזיק) וחידוש התפיסה בפתיחת עמוד בעורך.
// ההרשאה נבדקת בראוטים (requireProofSession מ-pool.js); כאן — המסד בלבד.
//
// תפיסה היא רק בלחיצה מפורשת ברשת-העמודים ("תפוס ועבוד" / "תפוס רצף") — אין חלוקה
// אוטומטית בשום מקום. עמוד נתפס רק אם הוא פתוח, פתוח למתנדבים (המנהל לא סגר
// אותו), המשתמש לא הגיש אותו, וההחכרה פנויה או כבר שלו (eligibleFilter). התפיסה
// אטומית (findOneAndUpdate/updateMany עם התנאי) — שני מתנדבים לא יקבלו אותו עמוד.
// כל עמוד שמור CLAIM_HOURS שעות (לכל עמוד לחוד), ומתחדש ל-CLAIM_HOURS שעות מלאות
// בכל פתיחה בעורך (renewLease); מחזיקים לכל היותר MAX_HELD עמודים (gridState.js).
// שעות שבתוך שבת או חג אינן נספרות — מועד-הסיום מחושב תמיד ב-lease.leaseEnd (הכלל המדויק שם).
// CLAIM_MS — משך התפיסה בלי שבת וחג באמצע (ימי-חול רצופים).

export const CLAIM_MS = CLAIM_HOURS * 60 * 60 * 1000;
export { MAX_HELD };

const PAUSED = 'הספר מושהה כרגע — אפשר להמשיך בעמודים שכבר בטיפולכם, אבל לא לתפוס עמודים חדשים';
const TOO_MANY = `אפשר להחזיק עד ${MAX_HELD} עמודים בבת אחת — הגישו או שחררו עמודים כדי לתפוס עוד`;

const oid = (v) => new mongoose.Types.ObjectId(String(v));
const fail = (status, error) => ({ ok: false, status, error });

// השדות שנדרשים למצב העמוד (בלי doc — כבד)
const STATE_FIELDS = {
  page: 1,
  seq: 1,
  lineCount: 1,
  required: 1,
  status: 1,
  activeCount: 1,
  approvedCount: 1,
  submitters: 1,
  leasedBy: 1,
  leasedUntil: 1,
  revision: 1,
  volunteer: 1,
  round: 1,
};

// "העמוד פנוי לתפיסה בידי המשתמש הזה": פתוח, פתוח למתנדבים, המשתמש לא הגיש
// אותו, וההחכרה פנויה (אין / פגה) או כבר שלו. לעמוד אחד ולרצף שנבחר ברשת.
export function eligibleFilter(uid, now) {
  return {
    status: 'open',
    ...volunteerOpenFilter(),
    submitters: { $ne: uid },
    $or: [{ leasedUntil: null }, { leasedUntil: { $lt: now } }, { leasedBy: uid }],
  };
}

// כמה עמודים מוחכרים עכשיו למשתמש ועוד לא הוגשו
function heldCount(uid, now) {
  return PageProofPage.countDocuments({ leasedBy: uid, leasedUntil: { $gt: now }, status: 'open', submitters: { $ne: uid } });
}

// ההגשות (הפעילות) של המשתמש לעמודים האלה ← Map(pageId → {status, createdAt})
// לגרסה הנוכחית של כל עמוד. הגשה לגרסה קודמת (לפני שהעמוד חזר מזיהוי-מחדש)
// אינה נספרת — העמוד פתוח שוב גם למי שהגיש אותה. אם המשתמש ב-submitters ואין
// הגשה בגרסה הזו (לא אמור לקרות) — ההגשה האחרונה שלו לעמוד. בקשה לזיהוי-מחדש
// (recutRequest) אינה הגשה — אינה נספרת.
async function mySubmissions(pages, uid) {
  const out = new Map();
  if (!pages.length) return out;
  const subs = await PageProofSubmission.find(
    { page: { $in: pages.map((p) => p._id) }, user: uid, status: { $in: ['submitted', 'approved'] }, recutRequest: { $ne: true } },
    { page: 1, status: 1, revision: 1, createdAt: 1, round: 1 }
  )
    .sort({ createdAt: -1 })
    .lean();
  const byPage = new Map();
  for (const s of subs) {
    const key = String(s.page);
    if (!byPage.has(key)) byPage.set(key, []);
    byPage.get(key).push(s);
  }
  for (const p of pages) {
    const list = byPage.get(String(p._id)) || [];
    const rev = storedRevision(p);
    // עמוד שמנהל פתח מחדש אחרי אישור (סבב חדש) — ההגשה מהסבב הקודם כבר אינה "שלי לעמוד"
    const current = list.find((s) => submissionRevision(s) === rev && roundOf(s) === roundOf(p));
    const listed = (p.submitters || []).some((s) => String(s) === String(uid));
    const sub = current || (listed ? list[0] : null);
    if (sub) out.set(String(p._id), { status: sub.status, createdAt: sub.createdAt });
  }
  return out;
}

const stateOf = (p, sub, uid, now) => pageStateFor({ ...p, mySubmissionStatus: sub?.status || null }, uid, now);

// ---------- רשימת הספרים ----------

// הספרים הפעילים, ולכל אחד: מונים לפי מצב (מנקודת המבט של המשתמש) והעמוד
// הראשון (לתמונה הממוזערת). המונים מחושבים בקבוצות במסד — בלי למשוך את כל
// העמודים: המצב תלוי רק בסטטוס, ב-required, ב-activeCount, בהחכרה (שלי /
// של אחר / אין) ובסגירה למתנדבים. העמודים שהמשתמש הגיש (מעטים) נבדקים
// אחד-אחד מול ההגשות שלו. עמוד סגור אינו נספר (כמו ברשת); ספר שאין בו עמוד
// שהמתנדב רואה — אינו ברשימה.
export async function listBooks(userId, now = new Date()) {
  const uid = oid(userId);
  const books = await PageProofBook.find({ status: 'active' }, { gid: 1, title: 1, script: 1, lineCount: 1 }).lean();
  if (!books.length) return [];
  const ids = books.map((b) => b._id);

  const [groups, firsts, submittedPages] = await Promise.all([
    PageProofPage.aggregate([
      { $match: { book: { $in: ids }, submitters: { $ne: uid } } },
      {
        $group: {
          _id: {
            book: '$book',
            status: '$status',
            required: '$required',
            active: '$activeCount',
            // כמו pageStateFor: החכרה = מחזיק + מועד שעוד לא עבר
            lease: {
              $cond: [
                { $and: [{ $gt: ['$leasedUntil', now] }, { $ne: [{ $ifNull: ['$leasedBy', null] }, null] }] },
                { $cond: [{ $eq: ['$leasedBy', uid] }, 'me', 'other'] },
                'none',
              ],
            },
            // סגור למתנדבים (volunteer:false; בלי השדה — פתוח)
            closed: { $eq: ['$volunteer', false] },
          },
          n: { $sum: 1 },
        },
      },
    ]),
    // העמוד הראשון (הפתוח למתנדבים) בכל ספר — לפי האינדקס (gid, page)
    PageProofPage.aggregate([
      { $match: { gid: { $in: books.map((b) => b.gid) }, ...volunteerOpenFilter() } },
      { $sort: { gid: 1, page: 1 } },
      { $group: { _id: '$gid', id: { $first: '$_id' }, revision: { $first: '$revision' } } },
    ]),
    PageProofPage.find({ book: { $in: ids }, submitters: uid }, { ...STATE_FIELDS, book: 1 }).lean(),
  ]);

  const future = new Date(now.getTime() + 60 * 1000);
  const statesByBook = new Map();
  const push = (bookId, state, n = 1) => {
    const key = String(bookId);
    if (!statesByBook.has(key)) statesByBook.set(key, []);
    statesByBook.get(key).push({ state, n });
  };
  for (const g of groups) {
    const { book, status, required, active, lease, closed } = g._id;
    const representative = {
      status,
      required,
      activeCount: active,
      submitters: [],
      leasedBy: lease === 'me' ? uid : lease === 'other' ? 'other' : null,
      leasedUntil: lease === 'none' ? null : future,
      volunteer: !closed,
    };
    // 'closed' אינו מצב שנספר (bookCounts מדלג עליו) — כמו ברשת
    push(book, pageStateFor(representative, uid, now), g.n);
  }
  const subs = await mySubmissions(submittedPages, uid);
  for (const p of submittedPages) push(p.book, stateOf(p, subs.get(String(p._id)), uid, now));

  const firstOf = new Map(firsts.map((f) => [f._id, f]));
  return books
    .map((b) => {
      const first = firstOf.get(b.gid);
      return {
        gid: b.gid,
        title: b.title,
        script: b.script || null,
        lineCount: b.lineCount || 0,
        firstPage: first ? { id: String(first.id), revision: storedRevision(first) } : null,
        counts: bookCounts(statesByBook.get(String(b._id)) || []),
      };
    })
    .filter((b) => b.counts.total > 0)
    .sort((a, b) => a.title.localeCompare(b.title, 'he'));
}

// ---------- רשת העמודים של ספר ----------

// כל עמודי הספר עם המצב בעיני המשתמש. לעמוד תפוס — שם המתנדב שמחזיק בו
// (כמו "ע"י ..." בספרים הישנים); לעמוד של המשתמש — מתי ההחכרה נגמרת; לעמוד
// שהגיש — מתי הגיש. מזהי משתמשים אחרים ורשימת המגישים אינם נשלחים.
// ספר מושהה מוחזר (active=false) — כדי שמי שמחזיק בו עמודים יוכל להמשיך.
// עמוד שהמנהל סגר למתנדבים אינו נשלח (אלא אם הוא בטיפול המשתמש או שהגיש
// אותו) — hidden = כמה כאלה, להסבר ברשת.
export async function bookPages(gid, userId, now = new Date()) {
  const uid = oid(userId);
  const book = await PageProofBook.findOne({ gid: String(gid) }, { gid: 1, title: 1, script: 1, status: 1, lineCount: 1 }).lean();
  if (!book) return null;

  const pages = await PageProofPage.find({ book: book._id }, STATE_FIELDS).sort({ page: 1 }).lean();
  const subs = await mySubmissions(
    pages.filter((p) => (p.submitters || []).some((s) => String(s) === String(uid))),
    uid
  );

  const all = pages.map((p) => {
    const sub = subs.get(String(p._id));
    return { p, sub, state: stateOf(p, sub, uid, now) };
  });
  const rows = all.filter((r) => r.state !== 'closed');

  const holders = [...new Set(rows.filter((r) => r.state === 'taken').map((r) => String(r.p.leasedBy)))];
  const users = holders.length ? await User.find({ _id: { $in: holders.map(oid) } }, { name: 1 }).lean() : [];
  const nameOf = new Map(users.map((u) => [String(u._id), u.name]));

  const out = rows.map(({ p, sub, state }) => ({
    id: String(p._id),
    page: p.page,
    seq: p.seq,
    lineCount: p.lineCount || 0,
    required: p.required || 1,
    revision: storedRevision(p),
    state,
    leasedUntil: state === 'mine' || state === 'taken' ? p.leasedUntil : null,
    claimer: state === 'taken' ? nameOf.get(String(p.leasedBy)) || 'מתנדב אחר' : null,
    submittedAt: state === 'submitted' || state === 'approved' ? sub?.createdAt || null : null,
  }));

  return {
    book: {
      gid: book.gid,
      title: book.title,
      script: book.script || null,
      active: book.status === 'active',
      lineCount: book.lineCount || 0,
    },
    pages: out,
    counts: bookCounts(out.map((r) => r.state)),
    hidden: all.length - rows.length,
  };
}

// המצב העדכני של עמוד אחד בעיני המשתמש (להסבר למה תפיסה נכשלה)
async function currentState(pid, uid, now) {
  const p = await PageProofPage.findById(pid, STATE_FIELDS).lean();
  if (!p) return null;
  const subs = await mySubmissions([p], uid);
  return stateOf(p, subs.get(String(p._id)), uid, now);
}

// ---------- תפיסה ושחרור ----------

// תפיסת עמוד אחד ל-CLAIM_HOURS שעות (בלי שבת וחג — leaseEnd). עמוד שכבר של המשתמש — ההחכרה מתארכת.
// ← {ok:true, page:{id, page, leasedUntil}} או {ok:false, status, error}
export async function claimPage(pageId, userId, now = new Date()) {
  const uid = oid(userId);
  const pid = oid(pageId);
  const page = await PageProofPage.findById(pid, { book: 1, leasedBy: 1, leasedUntil: 1 }).lean();
  if (!page) return fail(404, 'העמוד לא נמצא');
  const book = await PageProofBook.findById(page.book, { status: 1 }).lean();
  if (!book) return fail(404, 'הספר לא נמצא');
  if (book.status !== 'active') return fail(409, PAUSED);

  const alreadyMine = page.leasedBy && String(page.leasedBy) === String(uid) && page.leasedUntil > now;
  if (!alreadyMine && (await heldCount(uid, now)) >= MAX_HELD) return fail(409, TOO_MANY);

  const doc = await PageProofPage.findOneAndUpdate(
    { _id: pid, ...eligibleFilter(uid, now) },
    { $set: { leasedBy: uid, leasedUntil: leaseEnd(now) } },
    { returnDocument: 'after' }
  )
    .select({ page: 1, leasedUntil: 1 })
    .lean();
  if (doc) return { ok: true, page: { id: String(doc._id), page: doc.page, leasedUntil: doc.leasedUntil } };

  const state = await currentState(pid, uid, now);
  if (!state) return fail(404, 'העמוד לא נמצא');
  return fail(409, claimRefusal(state));
}

// שחרור עמוד: רק החכרה של המשתמש עצמו, ורק אם לא הגיש אותו
export async function releasePage(pageId, userId) {
  const uid = oid(userId);
  const pid = oid(pageId);
  const res = await PageProofPage.updateOne(
    { _id: pid, leasedBy: uid, submitters: { $ne: uid } },
    { $set: { leasedBy: null, leasedUntil: null } }
  );
  if (res.matchedCount) return { ok: true };

  const page = await PageProofPage.findById(pid, { leasedBy: 1, submitters: 1 }).lean();
  if (!page) return fail(404, 'העמוד לא נמצא');
  if ((page.submitters || []).some((s) => String(s) === String(uid))) {
    return fail(409, 'כבר הגשתם את העמוד הזה — אין מה לשחרר');
  }
  return fail(409, 'העמוד אינו משויך אליכם');
}

// תפיסת העמודים הפנויים (למשתמש) ברצף seq של הספר gid — עמודים שכבר שלו
// מתארכים; עמודים תפוסים/שהוגשו/ממתינים לזיהוי-מחדש נשארים כמו שהם. עמודים
// חדשים — רק עד MAX_HELD בסך הכול (הראשונים ברצף); השאר מדווחים ב-limited.
// ← {ok:true, claimed, limited, pages:[{id, page}]} או {ok:false, status, error}
export async function claimSequence(gid, seq, userId, now = new Date()) {
  if (!Number.isInteger(seq) || seq < 0) return fail(400, 'מספר רצף לא תקין');
  const uid = oid(userId);
  const book = await PageProofBook.findOne({ gid: String(gid) }, { status: 1 }).lean();
  if (!book) return fail(404, 'הספר לא נמצא');
  if (book.status !== 'active') return fail(409, PAUSED);
  const held = await heldCount(uid, now);
  if (held >= MAX_HELD) return fail(409, TOO_MANY);

  const cand = await PageProofPage.find(
    { book: book._id, seq, ...eligibleFilter(uid, now) },
    { page: 1, leasedBy: 1, leasedUntil: 1 }
  )
    .sort({ page: 1 })
    .lean();
  const isMine = (p) => p.leasedBy && String(p.leasedBy) === String(uid) && p.leasedUntil > now;
  const fresh = cand.filter((p) => !isMine(p));
  const take = fresh.slice(0, MAX_HELD - held);
  const ids = [...cand.filter(isMine), ...take].map((p) => p._id);
  if (!ids.length) return fail(409, 'אין ברצף הזה עמודים פנויים לתפיסה');

  const until = leaseEnd(now);
  const res = await PageProofPage.updateMany(
    { _id: { $in: ids }, ...eligibleFilter(uid, now) },
    { $set: { leasedBy: uid, leasedUntil: until } }
  );
  if (!res.modifiedCount) return fail(409, 'אין ברצף הזה עמודים פנויים לתפיסה');

  const pages = await PageProofPage.find({ _id: { $in: ids }, leasedBy: uid, leasedUntil: until }, { page: 1 })
    .sort({ page: 1 })
    .lean();
  return {
    ok: true,
    claimed: res.modifiedCount,
    limited: fresh.length - take.length,
    pages: pages.map((p) => ({ id: String(p._id), page: p.page })),
  };
}

// ---------- העמודים שלי, והעמוד בעורך ----------

// תמונת-מצב של רצף מנקודת המבט של המשתמש (לפס-הרצף בדף המתנדב). הגשה נספרת
// רק לגרסה שעליה נעשתה — עמוד שחזר מזיהוי-מחדש (גרסה חדשה) פתוח שוב גם למי
// שהגיש את הקודמת. לעמוד שבטיפולו — עד מתי הוא שמור לו (leasedUntil). עמוד שממתין
// לזיהוי-מחדש (גם כזה שהמשתמש שלח בעצמו) — 'recut' (בקשה לזיהוי-מחדש אינה הגשה). לעמוד שהגיש —
// מתי הגיש (submittedAt: "הוגש — ממתין לבדיקת מנהל (מאז …)").
export async function describeSequence(bookId, seq, uid, now = new Date()) {
  const [book, pages, mine] = await Promise.all([
    PageProofBook.findById(bookId, { gid: 1, title: 1, script: 1 }).lean(),
    PageProofPage.find({ book: bookId, seq }, { page: 1, leasedBy: 1, leasedUntil: 1, submitters: 1, status: 1, lineCount: 1, revision: 1, round: 1 })
      .sort({ page: 1 })
      .lean(),
    PageProofSubmission.find({ book: bookId, user: uid, status: { $ne: 'rejected' }, recutRequest: { $ne: true } }, { page: 1, status: 1, revision: 1, createdAt: 1, round: 1 }).lean(),
  ]);
  const mineByPage = new Map(mine.map((s) => [`${s.page}:${submissionRevision(s)}:${roundOf(s)}`, s]));
  return {
    book: book ? { id: String(book._id), gid: book.gid, title: book.title, script: book.script } : null,
    seq,
    pages: pages.map((p) => {
      const revision = storedRevision(p);
      const sub = mineByPage.get(`${p._id}:${revision}:${roundOf(p)}`);
      const leasedToMe = p.leasedBy && String(p.leasedBy) === String(uid) && p.leasedUntil > now;
      const state = sub ? (sub.status === 'approved' ? 'approved' : 'submitted') : p.status === 'recut' ? 'recut' : leasedToMe ? 'mine' : 'unavailable';
      return {
        id: String(p._id),
        page: p.page,
        lines: p.lineCount,
        revision,
        state,
        leasedUntil: state === 'mine' ? p.leasedUntil : null,
        submittedAt: sub ? sub.createdAt || null : null,
      };
    }),
  };
}

// הרצף של עמוד מסוים (פתיחה בעורך: /library/page-proof?page=<id>) — רק עמוד
// שבטיפול המשתמש (התפיסה בתוקף) או שהוא הגיש. כל עמוד אחר (פנוי, תפוס בידי
// אחר, תפיסה שפגה, סגור) ← null: הדף מסביר ומפנה לרשת-העמודים, ושום דבר אינו
// נתפס כאן. הספר אינו חייב להיות פעיל: מי שמחזיק עמודים בספר מושהה ממשיך בהם.
export async function sequenceOfPage(pageId, userId, now = new Date()) {
  if (!mongoose.Types.ObjectId.isValid(String(pageId))) return null;
  const uid = oid(userId);
  const p = await PageProofPage.findOne(
    { _id: oid(pageId), $or: [{ leasedBy: uid, leasedUntil: { $gt: now } }, { submitters: uid }] },
    { book: 1, seq: 1 }
  ).lean();
  return p ? describeSequence(p.book, p.seq, uid, now) : null;
}

// "העמודים שלי": הרצפים שבהם המשתמש מחזיק עכשיו עמודים שלא הגיש — הרצף
// שהתפיסה בו נגמרת ראשונה, ראשון. קריאה בלבד (שום דבר אינו נתפס או מתחדש).
export async function heldSequences(userId, now = new Date()) {
  const uid = oid(userId);
  const held = await PageProofPage.find(
    { leasedBy: uid, leasedUntil: { $gt: now }, status: 'open', submitters: { $ne: uid } },
    { book: 1, seq: 1 }
  )
    .sort({ leasedUntil: 1, _id: 1 })
    .lean();
  const seen = new Set();
  const firsts = held.filter((p) => {
    const key = `${p.book}:${p.seq}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const out = await Promise.all(firsts.map((p) => describeSequence(p.book, p.seq, uid, now)));
  return out.filter((s) => s.book);
}

// עמוד שביקשו לפתוח ואינו של המשתמש — מה צריך כדי להסביר ולהפנות לרשת:
// {id, gid, page, state} (המצב בעיני המשתמש, כמו ברשת), או null אם אינו קיים
export async function pageBrief(pageId, userId, now = new Date()) {
  if (!mongoose.Types.ObjectId.isValid(String(pageId))) return null;
  const uid = oid(userId);
  const p = await PageProofPage.findById(oid(pageId), { ...STATE_FIELDS, gid: 1 }).lean();
  if (!p) return null;
  const subs = await mySubmissions([p], uid);
  return { id: String(p._id), gid: p.gid, page: p.page, state: stateOf(p, subs.get(String(p._id)), uid, now) };
}

// פתיחת עמוד בעורך (GET /api/page-proof/pages/[id]) מחדשת את התפיסה שלו ל-
// CLAIM_HOURS שעות מלאות מעכשיו (בלי שבת וחג — leaseEnd) — רק לעמוד שהמשתמש מחזיק (התפיסה בתוקף)
// ועוד לא הגיש, גם אם המנהל סגר אותו בינתיים. עמוד פנוי, עמוד שהתפיסה עליו
// פגה ועמוד של אחר — לא נתפסים כאן (null): תפיסה היא רק בלחיצה מפורשת.
// ההחכרה רק מתארכת ($max) — לעולם לא מתקצרת.
export async function renewLease(pageId, userId, now = new Date()) {
  const uid = oid(userId);
  const until = leaseEnd(now);
  return PageProofPage.findOneAndUpdate(
    { _id: oid(pageId), status: 'open', submitters: { $ne: uid }, leasedBy: uid, leasedUntil: { $gt: now } },
    [{ $set: { leasedUntil: { $max: [{ $ifNull: ['$leasedUntil', until] }, until] } } }],
    { returnDocument: 'after', lean: true, updatePipeline: true }
  );
}
