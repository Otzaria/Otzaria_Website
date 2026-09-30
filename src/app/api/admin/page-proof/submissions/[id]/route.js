import { NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import connectDB from '@/lib/db';
import PageProofSubmission from '@/models/PageProofSubmission';
import PageProofPage from '@/models/PageProofPage';
import PageProofBook from '@/models/PageProofBook';
import { hasOcrAccess } from '@/lib/roles';
import { requireAccess, badRequest, notFound, serverError } from '@/lib/apiResponse';
import { editorPageShape, primaryOf, readJsonBody, tooBigResponse, resolveForeignLinks } from '@/lib/pageProof/pool';
import { validateOps, packOps, needsRecut, sanitizeOps } from '@/lib/pageProof/ops';
import {
  revisionFilter,
  sameRevision,
  storedRevision,
  submissionRevision,
  statusAfterApprove,
  statusAfterReject,
  statusAfterReleaseRecut,
} from '@/lib/pageProof/importRules';
import { pageSig, submissionDetail } from '@/lib/pageProof/adminReview';

async function gate(params) {
  const session = await getServerSession(authOptions);
  const denied = requireAccess(session, hasOcrAccess);
  if (denied) return { denied };
  const { id } = await params;
  if (!mongoose.Types.ObjectId.isValid(id)) return { denied: badRequest('מזהה לא תקין') };
  return { session, id };
}

const PAGE_FIELDS = { status: 1, revision: 1, activeCount: 1, required: 1 };
// עדכון מותנה במצב שנקרא — אם מנהל אחר שינה אותו בינתיים, קוראים שוב ומחשבים מחדש
const RETRIES = 3;

// GET: הגשה אחת + העמוד (לתצוגת העורך) + שאר ההגשות לאותו עמוד (כפולים).
// submission.revision מול page.revision: הגשה שנעשתה על גרסה קודמת של העמוד
// (לפני שחזר מזיהוי-מחדש) — העורך מציג אותה על הגרסה הנוכחית. page.sig — חתימת
// העמוד השמור, כמו sig בקובץ-התיקונים.
export async function GET(request, { params }) {
  const { id, denied } = await gate(params);
  if (denied) return denied;
  try {
    await connectDB();
    const sub = await PageProofSubmission.findById(id).lean();
    if (!sub) return notFound('ההגשה לא נמצאה');
    const [page, book, siblings] = await Promise.all([
      PageProofPage.findById(sub.page).lean(),
      PageProofBook.findById(sub.book, { title: 1, script: 1 }).lean(),
      PageProofSubmission.find({ page: sub.page, _id: { $ne: sub._id } }, { ops: 0 }).sort({ createdAt: 1 }).lean(),
    ]);
    if (!page) return notFound('העמוד של ההגשה לא נמצא');
    return NextResponse.json(
      {
        success: true,
        page: { ...editorPageShape(page, book), status: page.status, sig: pageSig(page) },
        submission: submissionDetail(sub),
        siblings: siblings.map((s) => ({
          id: String(s._id),
          userName: s.userName,
          status: s.status,
          opCount: s.opCount,
          needsRecut: !!s.needsRecut,
          revision: submissionRevision(s),
        })),
      },
      { headers: { 'Cache-Control': 'private, no-store' } }
    );
  } catch (e) {
    console.error('page-proof submission GET', e);
    return serverError();
  }
}

// PATCH {action:'approve'|'reject'|'release_recut', note?, ops?}
//   approve — מ-submitted בלבד. ops (אופציונלי) = הפעולות אחרי תיקון המנהל
//             (מנוקות ונארזות כמו בהגשה). אם ההגשה הראשית של העמוד (אחרי
//             האישור — fixesExport.pickPrimary) משנה את חיתוך-השורות, העמוד
//             עובר ל-'recut': לא מוצע למתנדבים עד שיחזור מתוכנת-הספר בגרסה
//             חדשה. עמוד כפול שעוד חסרה לו הגשה — ממתין להגשה האחרונה
//             (importRules.statusAfterApprove). הגשה שמשנה חיתוך אבל אינה הראשית
//             (הגשה אחרת לעמוד כבר יצאה בקובץ) — recutSkipped: תיקוני-החיתוך
//             שלה ייצאו רק בקובץ הכפולים.
//   reject  — מ-submitted, או ממאושרת שעוד לא יצאה בקובץ-תיקונים. העמוד
//             חוזר למאגר (המקום מתפנה, ומי שהגיש יכול לקבל אותו שוב) — אלא אם
//             הוא ממתין לזיהוי-מחדש בגלל הגשה מאושרת אחרת.
//   release_recut — העמוד של ההגשה ממתין לזיהוי-מחדש אבל לא יחזור מהתוכנה
//             (למשל תיקון-החיתוך נכשל שם): נסגר בלי זיהוי-מחדש — הושלם, או פתוח
//             לבודק נוסף בעמוד כפול. ההגשות עצמן לא משתנות.
// הגשה שנעשתה על גרסה קודמת של העמוד (שכבר הוחלף) משנה רק את עצמה — לא את
// המונים ולא את המצב של העמוד החדש.
export async function PATCH(request, { params }) {
  const { session, id, denied } = await gate(params);
  if (denied) return denied;
  try {
    const { body: raw, tooBig } = await readJsonBody(request);
    if (tooBig) return tooBigResponse();
    const body = raw && typeof raw === 'object' ? raw : {};
    const note = typeof body.note === 'string' ? body.note.trim().slice(0, 1000) : '';
    const reviewer = {
      reviewedBy: session.user.id || session.user._id,
      reviewedByName: session.user.name || '',
      reviewedAt: new Date(),
      reviewNote: note,
    };
    await connectDB();
    const sub = await PageProofSubmission.findById(id, { page: 1, user: 1, status: 1, exportedAt: 1, ops: 1, revision: 1 }).lean();
    if (!sub) return notFound('ההגשה לא נמצאה');

    if (body.action === 'approve') {
      const edited = Array.isArray(body.ops);
      const page = await PageProofPage.findById(sub.page, edited ? { doc: 1, gid: 1, ...PAGE_FIELDS } : PAGE_FIELDS).lean();
      const set = { status: 'approved', ...reviewer };
      let finalOps = sub.ops || [];
      if (edited) {
        if (!page) return notFound('העמוד של ההגשה לא נמצא');
        const packed = packOps(page.doc, sanitizeOps(body.ops));
        const invalid = validateOps(page.doc, packed);
        if (invalid) return badRequest(invalid);
        // קישור לעמוד אחר — כמו בהגשה: השורה אכן בעמוד ההוא של אותו ספר
        const far = await resolveForeignLinks(page, packed);
        if (far.error) return badRequest(far.error);
        const ops = far.ops;
        Object.assign(set, { ops, opCount: ops.length, reviewerEdited: true });
        finalOps = ops;
      }
      const recut = needsRecut(finalOps);
      set.needsRecut = recut;
      const done = await PageProofSubmission.findOneAndUpdate({ _id: id, status: 'submitted' }, { $set: set }, { returnDocument: 'after', lean: true });
      if (!done) return NextResponse.json({ success: false, error: 'ההגשה כבר טופלה' }, { status: 409 });

      let pageStatus = page?.status ?? null;
      let recutSkipped = false;
      const pageRev = storedRevision(page);
      if (page && sameRevision(submissionRevision(sub), pageRev)) {
        await PageProofPage.updateOne({ _id: sub.page, ...revisionFilter(pageRev) }, { $inc: { approvedCount: 1 } });
        // הראשית אחרי האישור הזה (אותו כלל של קובץ-התיקונים)
        const primary = await primaryOf(sub.page, pageRev);
        const primaryRecut = !!primary?.needsRecut;
        recutSkipped = recut && !primaryRecut;
        let cur = page;
        for (let k = 0; k < RETRIES && cur; k++) {
          const next = statusAfterApprove(cur.status, primaryRecut, cur);
          if (next === cur.status) {
            pageStatus = cur.status;
            break;
          }
          const r = await PageProofPage.updateOne(
            { _id: sub.page, ...revisionFilter(pageRev), status: cur.status },
            next === 'recut' ? { $set: { status: 'recut', leasedBy: null, leasedUntil: null } } : { $set: { status: next } }
          );
          if (r.matchedCount) {
            pageStatus = next;
            break;
          }
          cur = await PageProofPage.findById(sub.page, PAGE_FIELDS).lean();
          if (!cur || !sameRevision(storedRevision(cur), pageRev)) break;
        }
      }
      return NextResponse.json({ success: true, status: 'approved', opCount: done.opCount, needsRecut: recut, recutSkipped, pageStatus });
    }

    if (body.action === 'reject') {
      // המצב שלפני העדכון (returnDocument: before) — לא מהקריאה המוקדמת,
      // שעלולה להתיישן אם מנהל אחר אישר בינתיים
      const prev = await PageProofSubmission.findOneAndUpdate(
        { _id: id, $or: [{ status: 'submitted' }, { status: 'approved', exportedAt: null }] },
        { $set: { status: 'rejected', ...reviewer } },
        { returnDocument: 'before', lean: true }
      );
      if (!prev) return NextResponse.json({ success: false, error: 'אי אפשר לדחות הגשה שכבר יצאה בקובץ-תיקונים' }, { status: 409 });
      const wasApproved = prev.status === 'approved';
      let page = await PageProofPage.findById(sub.page, PAGE_FIELDS).lean();
      const pageRev = storedRevision(page);
      let pageStatus = page?.status ?? null;
      if (page && sameRevision(submissionRevision(prev), pageRev)) {
        // עמוד שממתין לזיהוי-מחדש נשאר כך אם ההגשה הראשית שנשארה (בלי זו) משנה חיתוך
        const rest = await primaryOf(sub.page, pageRev, prev._id);
        const stillRecut = !!rest?.needsRecut;
        for (let k = 0; k < RETRIES && page; k++) {
          const next = statusAfterReject(page.status, stillRecut);
          // המסנן כולל את המצב שנקרא — אישור מקביל שהעביר ל-recut לא נדרס
          const r = await PageProofPage.updateOne(
            { _id: sub.page, ...revisionFilter(pageRev), status: page.status },
            {
              $inc: { activeCount: -1, ...(wasApproved ? { approvedCount: -1 } : {}) },
              $pull: { submitters: sub.user },
              $set: { status: next },
            }
          );
          if (r.matchedCount) {
            pageStatus = next;
            break;
          }
          page = await PageProofPage.findById(sub.page, PAGE_FIELDS).lean();
          if (!page || !sameRevision(storedRevision(page), pageRev)) break;
        }
      }
      return NextResponse.json({ success: true, status: 'rejected', pageStatus });
    }

    if (body.action === 'release_recut') {
      const page = await PageProofPage.findById(sub.page, PAGE_FIELDS).lean();
      if (!page) return notFound('העמוד של ההגשה לא נמצא');
      if (page.status !== 'recut') return NextResponse.json({ success: false, error: 'העמוד אינו ממתין לזיהוי-מחדש' }, { status: 409 });
      const next = statusAfterReleaseRecut(page);
      const r = await PageProofPage.updateOne({ _id: sub.page, status: 'recut', ...revisionFilter(storedRevision(page)) }, { $set: { status: next } });
      if (!r.matchedCount) return NextResponse.json({ success: false, error: 'מצב העמוד השתנה בינתיים — טענו מחדש' }, { status: 409 });
      return NextResponse.json({ success: true, status: sub.status, pageStatus: next });
    }

    return badRequest('פעולה לא מוכרת');
  } catch (e) {
    console.error('page-proof submission PATCH', e);
    return serverError();
  }
}
