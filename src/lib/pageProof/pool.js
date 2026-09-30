import { NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import PageProofBook from '@/models/PageProofBook';
import PageProofPage from '@/models/PageProofPage';
import PageProofSubmission from '@/models/PageProofSubmission';
import { hasBookLibraryAccess, hasOcrAccess } from '@/lib/roles';
import { storedRevision, revisionFilter } from '@/lib/pageProof/importRules';
import { pickPrimary } from '@/lib/pageProof/fixesExport';
import { foreignLinkRefs, withForeignLines } from '@/lib/pageProof/ops';
import { isFurnitureStream } from '@/lib/pageProof/vocab';
import { volunteerOpenFilter } from '@/lib/pageProof/gridState';
import { CLAIM_MS, describeSequence, eligibleFilter } from '@/lib/pageProof/claims';

// עזרי-שרת להגהת-עמודים (/api/page-proof): הרשאה, "רצף אחר" (רצף אוטומטי
// בלחיצה מפורשת) ושחרור. היחידה שמחולקת כאן היא רצף (book+seq) של עד 5 עמודים
// עוקבים; ההגשה — לעמוד. בחירת עמודים ברשת, "העמודים שלי" וחידוש התפיסה
// בפתיחת עמוד — lib/pageProof/claims.js.

// תקרה לגוף בקשת-הגשה/אישור (JSON). הגשה אמיתית של עמוד — עשרות KB; השרת
// מקבל גופים גדולים מאוד בנתיבים אחרים (העלאות), ולכן התקרה כאן
export const MAX_BODY_BYTES = 4 * 1024 * 1024;

const oid = (v) => new mongoose.Types.ObjectId(String(v));

// גוף JSON עם תקרת-גודל: {body} (null אם אינו JSON) או {tooBig:true}
export async function readJsonBody(request, max = MAX_BODY_BYTES) {
  const len = Number(request?.headers?.get?.('content-length'));
  if (Number.isFinite(len) && len > max) return { tooBig: true };
  if (typeof request?.text === 'function') {
    const raw = await request.text().catch(() => null);
    if (raw == null) return { body: null };
    if (raw.length > max) return { tooBig: true };
    try {
      return { body: JSON.parse(raw) };
    } catch {
      return { body: null };
    }
  }
  return { body: await request.json().catch(() => null) };
}

export const tooBigResponse = () =>
  NextResponse.json({ success: false, error: 'הבקשה גדולה מדי — יותר מדי תיקונים בעמוד אחד' }, { status: 413 });

// מאומת, מנהל ספרייה או מנהל OCR. מחזיר {session, userId} או {error}.
export async function requireProofSession() {
  const session = await getServerSession(authOptions);
  if (!session) return { error: NextResponse.json({ success: false, error: 'יש להתחבר' }, { status: 401 }) };
  const u = session.user || {};
  if (!u.isVerified && !hasBookLibraryAccess(u.role) && !hasOcrAccess(u.role)) {
    return {
      error: NextResponse.json({ success: false, error: 'רק משתמשים מאומתים יכולים להגיה עמודים' }, { status: 403 }),
    };
  }
  const userId = u.id || u._id;
  if (!mongoose.Types.ObjectId.isValid(userId)) {
    return { error: NextResponse.json({ success: false, error: 'מזהה משתמש לא תקין' }, { status: 401 }) };
  }
  return { session, userId: String(userId) };
}

// המזהה שיוצא בשדה who של קובץ-התיקונים: יציב, לא שם
export const whoOf = (userId) => `otz-${String(userId)}`;

// ההגשה הראשית שאושרה לעמוד בגרסה (fixesExport.pickPrimary — אותו כלל של
// קובץ-התיקונים), או null. excludeId — הגשה שנדחתה עכשיו ואינה נספרת.
// ממנה נגזר אם העמוד ממתין לזיהוי-מחדש: רק תיקון-חיתוך שיוצא בקובץ הראשי
// יחזיר אותו מהתוכנה בגרסה חדשה.
export async function primaryOf(pageId, revision, excludeId = null) {
  const filter = { page: pageId, status: 'approved', ...revisionFilter(revision) };
  if (excludeId) filter._id = { $ne: excludeId };
  const subs = await PageProofSubmission.find(filter, { needsRecut: 1, exportedAt: 1, reviewedAt: 1 }).lean();
  return pickPrimary((subs || []).map((s) => ({ ...s, approvedAt: s.reviewedAt })));
}

async function activeBookIds() {
  const books = await PageProofBook.find({ status: 'active' }, { _id: 1 }).lean();
  return books.map((b) => b._id);
}

// "רצף אחר" (לחיצה מפורשת — שום כניסה לדף אינה קוראת לזה): הרצף הנוכחי של
// המשתמש (אם יש לו עמודים מוחכרים שלא הגיש), אחרת רצף חדש — רק עמודים פתוחים
// למתנדבים (eligibleFilter), כל אחד ל-CLAIM_HOURS שעות כמו תפיסה ברשת.
// skip: "bookId:seq" שהמשתמש דילג עליו עכשיו — לא יוצע שוב באותה בקשה.
export async function claimSequence(userId, skip = null) {
  const uid = oid(userId);
  const now = new Date();

  // כשהמשתמש מחזיק עמודים בכמה מקומות (גם מבחירה ברשת-העמודים) — הרצף שההחכרה
  // שלו נגמרת ראשונה, כדי שהבחירה תהיה צפויה
  const held = await PageProofPage.findOne(
    { leasedBy: uid, leasedUntil: { $gt: now }, status: 'open', submitters: { $ne: uid } },
    { book: 1, seq: 1 }
  )
    .sort({ leasedUntil: 1, _id: 1 })
    .lean();
  if (held) return describeSequence(held.book, held.seq, uid, now);

  const books = await activeBookIds();
  if (!books.length) return null;
  const [skipBook, skipSeq] = String(skip || '').split(':');

  for (let round = 0; round < 4; round++) {
    const match = { ...eligibleFilter(uid, now), book: { $in: books } };
    // רוחב לפני עומק: עדיפות לספרים שקיבלו פחות הגשות (הרוחב חשוב לאימון —
    // מסמך 40 §1). בתוך הספר — הרצף הראשון הפנוי.
    const groups = await PageProofPage.aggregate([
      { $match: match },
      { $group: { _id: { book: '$book', seq: '$seq' }, n: { $sum: 1 } } },
      { $sort: { '_id.seq': 1 } },
      { $group: { _id: '$_id.book', first: { $first: '$_id.seq' }, second: { $push: '$_id.seq' } } },
      { $sample: { size: 6 } },
    ]);
    if (!groups.length) return null;

    const counts = await PageProofSubmission.aggregate([
      { $match: { book: { $in: groups.map((g) => g._id) }, status: { $ne: 'rejected' } } },
      { $group: { _id: '$book', n: { $sum: 1 } } },
    ]);
    const countOf = new Map(counts.map((c) => [String(c._id), c.n]));
    groups.sort((a, b) => (countOf.get(String(a._id)) || 0) - (countOf.get(String(b._id)) || 0));

    for (const g of groups) {
      const seqs = g.second.filter((s) => !(String(g._id) === skipBook && String(s) === skipSeq));
      const seq = seqs[0];
      if (seq === undefined) continue;
      const res = await PageProofPage.updateMany(
        { ...eligibleFilter(uid, now), book: g._id, seq },
        { $set: { leasedBy: uid, leasedUntil: new Date(now.getTime() + CLAIM_MS) } }
      );
      if (res.modifiedCount > 0) return describeSequence(g._id, seq, uid, now);
    }
  }
  return null;
}

// שחרור הרצף (דילוג): העמודים שמוחכרים למשתמש ברצף הזה בלבד — לא עמודים
// שתפס בעצמו ברשת-העמודים בספרים/רצפים אחרים. בלי book/seq — כל ההחכרות שלו.
export async function releaseLeases(userId, { book = null, seq = null } = {}) {
  const uid = oid(userId);
  const filter = { leasedBy: uid };
  if (book != null && mongoose.Types.ObjectId.isValid(String(book)) && Number.isInteger(seq)) {
    filter.book = oid(book);
    filter.seq = seq;
  }
  const res = await PageProofPage.updateMany(filter, { $set: { leasedBy: null, leasedUntil: null } });
  return res.modifiedCount;
}

// open — עמודים פתוחים למתנדבים (בלי מה שהמנהל סגר)
export async function volunteerStats(userId) {
  const uid = oid(userId);
  const [open, done, mine] = await Promise.all([
    PageProofPage.countDocuments({ status: 'open', ...volunteerOpenFilter() }),
    PageProofPage.countDocuments({ status: 'done' }),
    PageProofSubmission.aggregate([
      { $match: { user: uid } },
      { $group: { _id: '$status', n: { $sum: 1 } } },
    ]),
  ]);
  const by = Object.fromEntries(mine.map((m) => [m._id, m.n]));
  return { open, done, mySubmitted: by.submitted || 0, myApproved: by.approved || 0, myRejected: by.rejected || 0 };
}

// קישורים לעמוד אחר בהגשה (link_add שצד אחד שלו בעמוד אחר של הספר — ops.foreignLinkRefs):
// אחרי validateOps (שבודק שהעמוד מוצהר) — השורה חייבת להיות בעמוד ההוא, באותו ספר, בלי
// שהוסרה ולא ריהוט. מספר-השורה ותחילת-הטקסט נלקחים מהעמוד השמור, לא ממה שהדפדפן שלח.
// page = העמוד של ההגשה ({doc, gid}). מחזיר {ops} או {error} בעברית.
export async function resolveForeignLinks(page, ops) {
  const refs = foreignLinkRefs(page?.doc, ops);
  if (!refs.length) return { ops };
  const pages = [...new Set(refs.map((r) => r.page))];
  const rows = await PageProofPage.find(
    { gid: page.gid, page: { $in: pages } },
    { page: 1, 'doc.lines.id': 1, 'doc.lines.line_no': 1, 'doc.lines.stream': 1, 'doc.lines.status': 1, 'doc.lines.text': 1, 'doc.lines.text_ocr': 1 }
  ).lean();
  const byPage = new Map((rows || []).map((r) => [r.page, new Map((r.doc?.lines || []).map((l) => [l.id, l]))]));
  const found = new Map();
  for (const r of refs) {
    const lines = byPage.get(r.page);
    if (!lines) return { error: `קישור לעמוד ${r.page}: העמוד הזה אינו בספר` };
    const line = lines.get(r.id);
    if (!line || line.status === 'removed') return { error: `קישור לעמוד ${r.page}: השורה שנבחרה אינה בעמוד ההוא` };
    if (isFurnitureStream(line.stream)) return { error: `קישור לעמוד ${r.page}: ריהוט הדף (כותרת-רצה, מספר עמוד) אינו מקושר` };
    found.set(`${r.page}:${r.id}`, line);
  }
  return { ops: withForeignLines(page.doc, ops, found) };
}

// צורת העמוד הנשלחת לעורך. שדות-השורה נשלחים כפי שהגיעו (כולל recheck —
// שורה שזוהתה מחדש ויש לבדוק, ו-para_breaks) חוץ מ-polygon/baseline הכבדים.
// revision — גרסת-העמוד (גם ב-doc.revision, שעליו נשען מפתח-הטיוטה בעורך);
// היא גם בכתובת-התמונה, כדי שתמונה שנשמרה במטמון הדפדפן לא תוצג לגרסה אחרת.
export function editorPageShape(p, book) {
  const lines = (p.doc?.lines || []).map(({ polygon, baseline, ...rest }) => rest);
  const revision = storedRevision(p);
  return {
    id: String(p._id),
    gid: p.gid,
    page: p.page,
    seq: p.seq,
    required: p.required,
    revision,
    title: book?.title || '',
    script: book?.script || null,
    imageUrl: `/api/page-proof/pages/${p._id}/image?v=${revision}`,
    doc: { ...p.doc, revision, lines },
  };
}
