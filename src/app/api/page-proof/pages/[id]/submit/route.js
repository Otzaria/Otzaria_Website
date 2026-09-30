import { NextResponse } from 'next/server';
import mongoose from 'mongoose';
import connectDB from '@/lib/db';
import PageProofPage from '@/models/PageProofPage';
import PageProofSubmission from '@/models/PageProofSubmission';
import { requireProofSession, whoOf, readJsonBody, tooBigResponse, primaryOf } from '@/lib/pageProof/pool';
import { validateOps, packOps, needsRecut, sanitizeOps } from '@/lib/pageProof/ops';
import { revisionFilter, sameRevision, storedRevision, statusWhenFull } from '@/lib/pageProof/importRules';
import { badRequest, notFound, serverError } from '@/lib/apiResponse';

const MAX_NOTE = 1000;

const conflict = (error) => NextResponse.json({ success: false, error }, { status: 409 });
const RELOAD = 'העמוד עודכן מאז שנפתח (חזר מזיהוי-מחדש) — טענו אותו מחדש';

// POST {ops, note, revision}: הגשת התיקונים של עמוד אחד. הפעולות מנוקות לצורת-
// החוזה (שדות שהחוזה אינו מכיר יורדים), נארזות (ops.packOps: דחיסה, הסדר
// שתוכנת-הספר צריכה, איחוד אישורי-השורות) ונבדקות מול העמוד השמור. ההגשה
// תמיד ממתינה לאישור מנהל. תפיסת-המקום אטומית: מצליחה רק אם העמוד עדיין
// פתוח ובאותה גרסה, המשתמש לא הגיש אותו, והוא מוחכר לו או פנוי — כך עמוד
// כפול לא יקבל שתי הגשות מאותו אדם, והגשה לא "תיפול" על גרסה חדשה של העמוד.
// revision — גרסת-העמוד שנפתחה בעורך; אם העמוד הוחלף מאז (חזר מזיהוי-מחדש)
// ההגשה נדחית ב-409 במקום להיבדק מול שורות אחרות. בקשה בלי revision (לשונית
// ישנה) מתקבלת רק כשהעמוד עדיין בגרסה 1.
// ההגשה שומרת את הגרסה ואת needsRecut (הפעולות משנות את חיתוך-השורות).
export async function POST(request, { params }) {
  const { session, userId, error } = await requireProofSession();
  if (error) return error;
  try {
    const { id } = await params;
    if (!mongoose.Types.ObjectId.isValid(id)) return badRequest('מזהה עמוד לא תקין');
    const { body, tooBig } = await readJsonBody(request);
    if (tooBig) return tooBigResponse();
    if (!body || !Array.isArray(body.ops)) return badRequest('רשימת תיקונים חסרה');
    const note = typeof body.note === 'string' ? body.note.trim().slice(0, MAX_NOTE) : '';

    await connectDB();
    const page = await PageProofPage.findById(id, { doc: 1, gid: 1, page: 1, book: 1, required: 1, revision: 1, status: 1 }).lean();
    if (!page) return notFound('העמוד לא נמצא');
    const revision = storedRevision(page);
    const sent = body.revision === undefined || body.revision === null ? null : Number(body.revision);
    if (sent === null ? revision > 1 : !sameRevision(sent, revision)) return conflict(RELOAD);

    const ops = packOps(page.doc, sanitizeOps(body.ops));
    const invalid = validateOps(page.doc, ops);
    if (invalid) return badRequest(invalid);

    const uid = new mongoose.Types.ObjectId(userId);
    const now = new Date();
    const claimed = await PageProofPage.findOneAndUpdate(
      {
        _id: id,
        status: 'open',
        ...revisionFilter(revision),
        submitters: { $ne: uid },
        $or: [{ leasedBy: uid }, { leasedUntil: null }, { leasedUntil: { $lt: now } }],
      },
      { $inc: { activeCount: 1 }, $push: { submitters: uid }, $set: { leasedBy: null, leasedUntil: null } },
      { returnDocument: 'after', lean: true }
    );
    if (!claimed) {
      // הסבר לפי המצב העדכני (לא רק "הוגש או נלקח")
      const now2 = await PageProofPage.findById(id, { status: 1, revision: 1 }).lean();
      if (now2 && !sameRevision(storedRevision(now2), revision)) return conflict(RELOAD);
      if (now2?.status === 'recut') {
        return conflict('העמוד הועבר לחיתוך ולזיהוי-מחדש בתוכנה אחרי תיקון-חיתוך שאושר, ולכן אי אפשר להגיש אותו עכשיו. הוא יחזור להגהה במעבר שני.');
      }
      return conflict('העמוד כבר הוגש או נלקח בידי מתנדב אחר');
    }

    const recut = needsRecut(ops);
    let sub;
    try {
      sub = await PageProofSubmission.create({
        page: page._id,
        book: page.book,
        gid: page.gid,
        pageNo: page.page,
        user: uid,
        userName: session.user.name || '',
        who: whoOf(userId),
        ops,
        opCount: ops.length,
        needsRecut: recut,
        revision,
        note,
      });
    } catch (e) {
      // ביטול תפיסת-המקום — אחרת העמוד "תקוע" עם מונה שאין מאחוריו הגשה
      await PageProofPage.updateOne({ _id: id }, { $inc: { activeCount: -1 }, $pull: { submitters: uid } });
      throw e;
    }

    if (claimed.activeCount >= claimed.required) {
      // העמוד מלא. אם ההגשה הראשית שכבר אושרה לו משנה חיתוך (אישור שחיכה
      // להגשה האחרונה של עמוד כפול) — הוא עובר עכשיו לזיהוי-מחדש; אחרת 'done'
      const primary = await primaryOf(page._id, revision);
      await PageProofPage.updateOne(
        { _id: id, status: 'open', activeCount: { $gte: claimed.required } },
        { $set: { status: statusWhenFull(!!primary?.needsRecut) } }
      );
    }

    return NextResponse.json({ success: true, submissionId: String(sub._id), opCount: ops.length, needsRecut: recut });
  } catch (e) {
    console.error('page-proof submit', e);
    return serverError();
  }
}
