import mongoose from 'mongoose';
// נתיבים יחסיים (לא '@/') — כדי שבדיקת-האינטגרציה (framesDb.int.test.mjs) תרוץ עם node:test מול MongoDB אמיתי
import TrainingProofItem from '../../../../../models/TrainingProofItem.js';
import TrainingProofBook from '../../../../../models/TrainingProofBook.js';
import TrainingProofPackage from '../../../../../models/TrainingProofPackage.js';
import User from '../../../../../models/User.js';
import { BOOK_CLAIM_MS } from '../../../../../lib/trainingProof/vocab.js';
import {
  checkFramesPage,
  checkNewStream,
  pageState,
  pageBy,
  effectiveFrames,
  bookState,
  claimDecision,
  claimActive,
  isDoneState,
  resyncResult,
} from '../../../../../components/trainingProof/frames/rules.js';
import { checkStreamKind } from '../../../../../components/trainingProof/frames/streamRoles.js';

// גלאי האזורים באתר — המסד (docs/76 §4.3, §8.1–§8.2; docs/75 ה-8…ה-10). ההרשאה נבדקת בנתיבים
// (requireTrainingProofSession); כאן — רק מה שמותר לפי מצב הספר והעמוד. הכללים הטהורים — rules.js.
//
// * ספר נלקח בשלמותו ל-48 שעות (עדכון מותנה אטומי — שני מתנדבים לא יקבלו אותו ספר). בשחרור, או כשהזמן
//   עבר, הוא חוזר לרשימה (lastBy = מי שהחזיק), ומי שממשיך רואה את כל מה שכבר סומן.
// * כל שינוי בעמוד נשמר מיד: טיוטה (held) או "העמוד נכון"/"דלג" (submitted, result לפי §5.3).
//   רק מי שמחזיק את הספר עכשיו שומר; עמוד שהמנהל כבר אישר — קריאה בלבד.
//
// כל פונקציה מחזירה {ok:true, …} או {ok:false, status, error}.

const SECTION = 'frames';
const oid = (v) => new mongoose.Types.ObjectId(String(v));
const fail = (status, error) => ({ ok: false, status, error });
export const pageImageUrl = (id) => `/api/training-proof/frames/pages/${id}/image`;
export const pageThumbUrl = (id) => `/api/training-proof/frames/pages/${id}/image?thumb=1`;

// חלקי-חבילות מושהים — עמודיהם לא מוצגים למתנדבים
async function closedParts() {
  const closed = await TrainingProofPackage.find({ section: SECTION, open: false }, { packageId: 1, part: 1 }).lean();
  return closed.map((p) => ({ packageId: p.packageId, part: p.part }));
}

// ספרים שהזמן שלהם עבר → חוזרים לרשימה; lastBy = מי שהחזיק. (עדכון-צינור — דרך המנהל של mongo ישירות)
export async function sweepBooks(now = new Date()) {
  const res = await TrainingProofBook.collection.updateMany(
    { claimedBy: { $ne: null }, claimedUntil: { $lt: now } },
    [{ $set: { lastBy: '$claimedBy', claimedBy: null, claimedUntil: null } }]
  );
  return res.modifiedCount;
}

// מונים לכל ספר: {book → {total, done, draft, by:{userId: עמודים}}}. books — רשימת מפתחות (או הכול)
export async function pageCounts(books = null, { includeClosed = false } = {}) {
  const match = { section: SECTION };
  if (books) match.book = { $in: books };
  if (!includeClosed) {
    const closed = await closedParts();
    if (closed.length) match.$nor = closed;
  }
  const rows = await TrainingProofItem.aggregate([
    { $match: match },
    {
      $project: {
        book: 1,
        done: { $cond: [{ $in: ['$status', ['submitted', 'approved']] }, 1, 0] },
        draft: { $cond: [{ $and: [{ $eq: ['$status', 'held'] }, { $eq: ['$result.status', 'draft'] }] }, 1, 0] },
        by: {
          $cond: [
            { $in: ['$status', ['submitted', 'approved']] },
            '$vol',
            { $cond: [{ $eq: ['$status', 'held'] }, '$heldBy', null] },
          ],
        },
      },
    },
    { $group: { _id: { book: '$book', by: '$by' }, total: { $sum: 1 }, done: { $sum: '$done' }, draft: { $sum: '$draft' } } },
  ]);
  const out = {};
  for (const r of rows) {
    const c = (out[r._id.book] ||= { total: 0, done: 0, draft: 0, by: {} });
    c.total += r.total;
    c.done += r.done;
    c.draft += r.draft;
    if (r._id.by) c.by[String(r._id.by)] = (c.by[String(r._id.by)] || 0) + r.done + r.draft;
  }
  return out;
}

async function namesOf(ids) {
  const list = [...new Set(ids.filter(Boolean).map(String))].filter((s) => mongoose.Types.ObjectId.isValid(s));
  if (!list.length) return {};
  const users = await User.find({ _id: { $in: list.map(oid) } }, { name: 1 }).lean();
  return Object.fromEntries(users.map((u) => [String(u._id), u.name || '']));
}

const aliasNum = (a) => {
  const m = /(\d+)/.exec(a || '');
  return m ? +m[1] : 1e9;
};
const STATE_RANK = { mine: 0, partial: 1, free: 2, taken: 3, done: 4 };

// רשימת הספרים למתנדב: לכל ספר מצב (פנוי / אצלך / בעבודה אצל … / הופסק באמצע — N עמ' בידי … / הושלם)
export async function listBooks(userId, now = new Date()) {
  await sweepBooks(now);
  const [books, counts] = await Promise.all([TrainingProofBook.find({}).lean(), pageCounts()]);
  const rows = books
    .map((b) => ({ b, c: counts[b.book] }))
    .filter(({ c }) => c && c.total > 0)
    .map(({ b, c }) => ({ b, c, st: bookState(b, c, userId, now) }));
  const names = await namesOf(rows.flatMap(({ st }) => [st.claimedBy, st.workedBy]));
  const list = rows.map(({ b, c, st }) => ({
    book: b.book,
    alias: b.alias || '',
    kind: b.kind || null,
    pages: c.total,
    done: c.done,
    draft: c.draft,
    state: st.state,
    claimedUntil: st.claimedUntil ? st.claimedUntil.toISOString() : null,
    who: st.state === 'taken' ? names[st.claimedBy] || 'מתנדב' : null,
    worked: st.worked,
    workedBy: st.workedBy ? (String(st.workedBy) === String(userId) ? 'you' : names[st.workedBy] || 'מתנדב') : null,
  }));
  list.sort((a, b) => STATE_RANK[a.state] - STATE_RANK[b.state] || aliasNum(a.alias) - aliasNum(b.alias));
  return { ok: true, books: list };
}

// "קח את הספר" / "המשך מהעבודה הקודמת": 48 שעות. ספר שכבר אצלך — בלי לשנות את המועד
export async function claimBook(userId, bookKey, now = new Date()) {
  await sweepBooks(now);
  const [book, otherClaims] = await Promise.all([
    TrainingProofBook.findOne({ book: bookKey }).lean(),
    TrainingProofBook.find(
      { claimedBy: oid(userId), claimedUntil: { $gt: now }, book: { $ne: bookKey } },
      { book: 1, alias: 1 }
    ).lean(),
  ]);
  // ספירה אחת לספר המבוקש ולכל הספרים האחרים שאצלו — גם ספר שהוגש כולו נשאר תפוס ל-48 שעות.
  const countsByBook = await pageCounts([bookKey, ...otherClaims.map((b) => b.book)]);
  const counts = countsByBook[bookKey] || { total: 0, done: 0, draft: 0, by: {} };
  if (book && !counts.total) return fail(404, 'אין בספר הזה עמודים לעבודה');
  for (const b of otherClaims) b.counts = countsByBook[b.book];
  const d = claimDecision(book, counts, userId, now, { otherClaims });
  if (!d.ok) return fail(d.status, d.error);
  if (d.already) return { ok: true, book: bookKey, claimedUntil: book.claimedUntil, already: true };
  const until = new Date(now.getTime() + BOOK_CLAIM_MS);
  const doc = await TrainingProofBook.findOneAndUpdate(
    { book: bookKey, $or: [{ claimedBy: null }, { claimedUntil: { $lte: now } }] },
    { $set: { claimedBy: oid(userId), claimedUntil: until } },
    { returnDocument: 'after', lean: true }
  );
  if (!doc) return fail(409, 'מתנדב אחר לקח את הספר הרגע');
  return { ok: true, book: bookKey, claimedUntil: doc.claimedUntil, already: false };
}

// "שחרר": הסימונים נשמרים, והספר חוזר לרשימה כ"הופסק באמצע"
export async function releaseBook(userId, bookKey) {
  const doc = await TrainingProofBook.findOneAndUpdate(
    { book: bookKey, claimedBy: oid(userId) },
    { $set: { claimedBy: null, claimedUntil: null, lastBy: oid(userId) } },
    { returnDocument: 'after', lean: true }
  );
  if (!doc) return fail(409, 'הספר לא אצלך');
  return { ok: true };
}

// הזרמים לדפדפן — בלי מי הוסיף ומתי. stationRole — רק לזרם מהתחנה שהסוג שלו שונה באתר
const publicStreams = (list) =>
  (list || []).map((s) => ({
    id: s.id,
    name: s.name,
    role: s.role || null,
    ...(s.added ? { added: true } : {}),
    ...(!s.added && s.stationRole && s.stationRole !== s.role ? { stationRole: s.stationRole } : {}),
  }));

const mineNow = (book, userId, now) => claimActive(book, now) && String(book.claimedBy) === String(userId);

// שינוי סוג זרם נוגע בספר ובכמה עמודים, ובייצור MongoDB רץ כ-standalone ללא transaction.
// לכן הפעולה היא journaled וניתנת לחזרה: הספר נושא את רשימת-היעד, העמודים ננעלים
// בסמן זהה, מסונכרנים ב-bulk, ורק אז הספר עובר לרשימת-היעד. שמירה ואישור דורשים
// streamChange:null, כך שמי שניצח לפני הנעילה נכלל בסנכרון ומי שבא אחריה ממתין.
async function syncMarkedPages(bookKey, changeId, streams) {
  const items = await TrainingProofItem.find(
    { section: SECTION, book: bookKey, 'streamChange.id': changeId },
    { result: 1 }
  ).lean();
  const ops = [];
  for (const it of items) {
    const result = resyncResult(it.result, streams);
    if (result !== it.result) {
      ops.push({ updateOne: { filter: { _id: it._id, 'streamChange.id': changeId }, update: { $set: { result } } } });
    }
  }
  if (ops.length) await TrainingProofItem.bulkWrite(ops, { ordered: false });
  return ops.length;
}

async function settleStreamChange(bookKey) {
  const book = await TrainingProofBook.findOne({ book: bookKey }).lean();
  if (!book?.streamChange?.id) {
    // ייתכן שהתהליך נעצר אחרי commit הספר ולפני ניקוי סמני העמודים.
    if (book?.streamChangeCleanup) {
      await TrainingProofItem.updateMany(
        { section: SECTION, book: bookKey, 'streamChange.id': book.streamChangeCleanup },
        { $set: { streamChange: null } }
      );
      await TrainingProofBook.updateOne(
        { book: bookKey, streamChange: null, streamChangeCleanup: book.streamChangeCleanup },
        { $set: { streamChangeCleanup: null } }
      );
    }
    return { ok: true, book };
  }
  const change = book.streamChange;
  await TrainingProofItem.updateMany(
    {
      section: SECTION,
      book: bookKey,
      status: { $in: ['held', 'submitted'] },
      reviewedAt: null,
      'result.frames.stream': change.streamId,
    },
    { $set: { streamChange: { id: change.id } } }
  );
  const approved = await TrainingProofItem.countDocuments({
    section: SECTION,
    book: bookKey,
    status: 'approved',
    'result.frames.stream': change.streamId,
  });
  if (approved) {
    // אישור שניצח לפני נעילת העמודים מבטל את הפעולה כולה ומחזיר כל עמוד שכבר
    // סונכרן לסוג המקורי. גם מסלול זה idempotent ולכן בטוח לאחר כשל ביניים.
    await syncMarkedPages(bookKey, change.id, book.streams || []);
    await TrainingProofItem.updateMany({ section: SECTION, book: bookKey, 'streamChange.id': change.id }, { $set: { streamChange: null } });
    await TrainingProofBook.updateOne({ book: bookKey, 'streamChange.id': change.id }, { $set: { streamChange: null } });
    return { ok: false, status: 409, error: 'עמוד עם הזרם הזה אושר בינתיים — הסוג לא השתנה' };
  }
  const pages = await syncMarkedPages(bookKey, change.id, change.streams || []);
  const committed = await TrainingProofBook.findOneAndUpdate(
    { book: bookKey, 'streamChange.id': change.id },
    { $set: { streams: change.streams || [], streamChange: null, streamChangeCleanup: change.id } },
    { returnDocument: 'after', lean: true }
  );
  // אם בקשה קודמת כבר ביצעה commit, הספר העדכני הוא מקור-האמת; בכל מקרה הסמן יתום.
  await TrainingProofItem.updateMany({ section: SECTION, book: bookKey, 'streamChange.id': change.id }, { $set: { streamChange: null } });
  await TrainingProofBook.updateOne(
    { book: bookKey, streamChange: null, streamChangeCleanup: change.id },
    { $set: { streamChangeCleanup: null } }
  );
  const done = committed || (await TrainingProofBook.findOne({ book: bookKey }).lean());
  if (done) done.streamChangeCleanup = null;
  return { ok: true, book: done, pages };
}

// עמוד לדפדפן. בלי מפתח-הספר, בלי sig ובלי מזהי-תחנה — רק מה שהעורך צריך
export function pageView(item, names = {}, userId = null) {
  const p = item.payload || {};
  const st = pageState(item);
  const by = pageBy(item);
  return {
    id: String(item._id),
    page: Number.isInteger(p.page) ? p.page : null,
    w: p.w,
    h: p.h,
    img: pageImageUrl(String(item._id)),
    thumb: pageThumbUrl(String(item._id)),
    ptype: p.ptype || null,
    state: st,
    by: by ? (String(by) === String(userId) ? 'you' : names[by] || 'מתנדב') : null,
    frames: effectiveFrames(item),
    proposal: (p.frames || []).map((f) => ({ ...f, src: 'auto' })),
    adminFixed: !!item.adminFixed,
  };
}

// ספר אחד עם כל עמודיו. מתנדב — רק כשהספר אצלו; מנהל (סקירה) — תמיד
export async function bookDetail(userId, bookKey, { isAdmin = false, now = new Date() } = {}) {
  await sweepBooks(now);
  await settleStreamChange(bookKey);
  const book = await TrainingProofBook.findOne({ book: bookKey }).lean();
  if (!book) return fail(404, 'הספר לא נמצא');
  const mine = mineNow(book, userId, now);
  if (!mine && !isAdmin) return fail(403, 'הספר לא אצלך — קחו אותו מרשימת הספרים');
  const match = { section: SECTION, book: bookKey };
  if (!isAdmin) {
    const closed = await closedParts();
    if (closed.length) match.$nor = closed;
  }
  const items = await TrainingProofItem.find(match).lean();
  items.sort((a, b) => (a.payload?.page ?? 0) - (b.payload?.page ?? 0) || String(a._id).localeCompare(String(b._id)));
  const names = await namesOf(items.map(pageBy));
  return {
    ok: true,
    book: {
      book: book.book,
      alias: book.alias || '',
      kind: book.kind || null,
      streams: publicStreams(book.streams),
      claimedUntil: mine ? book.claimedUntil : null,
      mine,
    },
    pages: items.map((it) => pageView(it, names, userId)),
  };
}

// שמירת עמוד: body = {status:'draft'|'marked'|'skip', frames}. מחזיר {ok, page, bookDone}
export async function savePage(userId, itemId, body, { now = new Date(), names = {} } = {}) {
  if (!mongoose.Types.ObjectId.isValid(String(itemId))) return fail(400, 'מזהה לא תקין');
  const item = await TrainingProofItem.findOne({ _id: oid(itemId), section: SECTION }).lean();
  if (!item) return fail(404, 'העמוד לא נמצא');
  if (item.status === 'approved') return fail(409, 'המנהל כבר אישר את העמוד — אי-אפשר לשנות אותו');
  const settled = await settleStreamChange(item.book);
  if (!settled.ok) return settled;
  const book = settled.book;
  if (!book || !mineNow(book, userId, now)) return fail(409, 'הספר כבר לא אצלך — חזרו לרשימת הספרים וקחו אותו שוב');
  const { result, error } = checkFramesPage(item.payload, body, { streams: book.streams });
  if (error) return fail(400, error);
  const uid = oid(userId);
  const set =
    result.status === 'draft'
      ? { status: 'held', heldBy: uid, heldUntil: null, heldAt: now, result, vol: null, submittedAt: null }
      : { status: 'submitted', heldBy: uid, heldUntil: null, heldAt: now, result, vol: uid, submittedAt: now };
  const doc = await TrainingProofItem.findOneAndUpdate(
    { _id: item._id, status: { $in: ['available', 'held', 'submitted', 'rejected'] }, reviewedAt: null, streamChange: null },
    { $set: set },
    { returnDocument: 'after', lean: true }
  );
  if (!doc) return fail(409, 'המנהל כבר אישר את העמוד — אי-אפשר לשנות אותו');
  let bookDone = false;
  if (isDoneState(pageState(doc))) {
    const c = (await pageCounts([item.book], { includeClosed: true }))[item.book];
    bookDone = !!c && c.done >= c.total;
    if (bookDone) await TrainingProofBook.updateOne({ book: item.book }, { $set: { doneBy: uid } });
  }
  return { ok: true, page: pageView(doc, names, userId), bookDone };
}

// זרם חדש לספר (נכנס ל-streams_added של כל עמוד שמשתמש בו). רק מי שמחזיק את הספר
export async function addStream(userId, bookKey, body, now = new Date()) {
  const settled = await settleStreamChange(bookKey);
  if (!settled.ok) return settled;
  const book = settled.book;
  if (!book) return fail(404, 'הספר לא נמצא');
  if (!mineNow(book, userId, now)) return fail(409, 'הספר כבר לא אצלך');
  const { stream, error } = checkNewStream(book.streams, body);
  if (error) return fail(400, error);
  const doc = await TrainingProofBook.findOneAndUpdate(
    { book: bookKey, claimedBy: oid(userId), streamChange: null, 'streams.id': { $ne: stream.id }, 'streams.name': { $ne: stream.name } },
    { $push: { streams: { ...stream, by: oid(userId), at: now } } },
    { returnDocument: 'after', lean: true }
  );
  if (!doc) return fail(409, 'הרשימה השתנתה בינתיים — נסו שוב');
  return { ok: true, stream, streams: publicStreams(doc.streams) };
}

// שינוי הסוג של זרם (body = {role}): הסוג משתנה ברשימת-הזרמים של הספר, ובכל העמודים שעוד לא אושרו — התפקיד של
// כל מסגרות הזרם, streams_added (זרם שנוסף באתר) ו-streams_changed (זרם מהתחנה; stationRole = הסוג שהגיע ממנה,
// נשמר בשינוי הראשון) — כמו frames_streams בתחנה. עמוד שהמתנדב עוד לא נגע בו מקבל את הסוג כשהוא נפתח, ובשמירה
// (checkFramesPage). רק מי שמחזיק את הספר. אם יש עמוד שכבר אושר עם הזרם — לא משנים: העמוד הזה כבר יוצא לתחנה
// בסוג הישן.
// מחזיר {ok, stream, streams, pages (כמה עמודים השתנו)}
export async function setStreamKind(userId, bookKey, streamId, body, now = new Date()) {
  const settled = await settleStreamChange(bookKey);
  if (!settled.ok) return settled;
  const book = settled.book;
  if (!book) return fail(404, 'הספר לא נמצא');
  if (!mineNow(book, userId, now)) return fail(409, 'הספר כבר לא אצלך');
  const { streams: checkedStreams, stream, from, error } = checkStreamKind(book.streams, streamId, body);
  if (error) return fail(400, error);
  if (from === stream.role) return { ok: true, stream: publicStreams([stream])[0], streams: publicStreams(book.streams), pages: 0 };
  const approved = await TrainingProofItem.countDocuments({ section: SECTION, book: bookKey, status: 'approved', 'result.frames.stream': streamId });
  if (approved) {
    return fail(409, `${approved === 1 ? 'עמוד אחד' : `${approved} עמודים`} עם הזרם הזה כבר ${approved === 1 ? 'אושר' : 'אושרו'} — אי-אפשר לשנות את הסוג שלו. אפשר להוסיף זרם חדש מהסוג הנכון`);
  }
  const targetStreams = checkedStreams.map((s) =>
    s.id === streamId && !s.added && !s.stationRole ? { ...s, stationRole: from } : s
  );
  const changeId = new mongoose.Types.ObjectId().toString();
  const doc = await TrainingProofBook.findOneAndUpdate(
    { book: bookKey, claimedBy: oid(userId), claimedUntil: { $gt: now }, streamChange: null, streams: { $elemMatch: { id: streamId, role: from } } },
    { $set: { streamChange: { id: changeId, streamId, from, role: stream.role, streams: targetStreams, startedAt: now } } },
    { returnDocument: 'after', lean: true }
  );
  if (!doc) return fail(409, 'הרשימה השתנתה בינתיים — נסו שוב');
  const done = await settleStreamChange(bookKey);
  if (!done.ok) return done;
  return { ok: true, stream: publicStreams([{ ...stream }])[0], streams: publicStreams(done.book.streams), pages: done.pages || 0 };
}

// התמונה של עמוד: למי שמחזיק את הספר, או למנהל. מחזיר {ok, imagePath}
export async function pageImagePath(userId, itemId, { isAdmin = false, now = new Date() } = {}) {
  if (!mongoose.Types.ObjectId.isValid(String(itemId))) return fail(400, 'מזהה לא תקין');
  const item = await TrainingProofItem.findOne({ _id: oid(itemId), section: SECTION }, { imagePath: 1, book: 1 }).lean();
  if (!item) return fail(404, 'העמוד לא נמצא');
  if (!isAdmin) {
    const book = await TrainingProofBook.findOne({ book: item.book }, { claimedBy: 1, claimedUntil: 1 }).lean();
    if (!book || !mineNow(book, userId, now)) return fail(403, 'הספר לא אצלך');
  }
  return { ok: true, imagePath: item.imagePath };
}
