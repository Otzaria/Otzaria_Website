import { NextResponse } from 'next/server';
import mongoose from 'mongoose';
import connectDB from '@/lib/db';
import PageProofPage from '@/models/PageProofPage';
import PageProofBook from '@/models/PageProofBook';
import PageProofSubmission from '@/models/PageProofSubmission';
import { requireProofSession, editorPageShape } from '@/lib/pageProof/pool';
import { renewLease } from '@/lib/pageProof/claims';
import { sameRevision, storedRevision, submissionRevision } from '@/lib/pageProof/importRules';
import { hasOcrAccess } from '@/lib/roles';
import { recutStatus } from '@/lib/pageProof/runtime';
import { editorContext } from '@/lib/pageProof/serverDrafts';
import { sameRound } from '@/lib/pageProof/reopenRules';
import { badRequest, notFound, forbidden, serverError } from '@/lib/apiResponse';

// GET: עמוד לעורך. מתנדב — רק עמוד שבטיפולו (התפיסה בתוקף; הפתיחה מחדשת אותה
// ל-48 שעות מלאות, בלי שבת וחג — claims.renewLease; leasedUntil בתשובה) או עמוד שכבר הגיש (לצפייה, עם הפעולות
// שלו). עמוד פנוי אינו נתפס כאן: תפיסה רק בלחיצה מפורשת ברשת-העמודים.
// מנהל OCR — כל עמוד, לקריאה.
// עם העמוד (docs/63 §2): draft — הטיוטה שבשרת (למחזיק בעריכה — עוברת אליו אם הייתה של מתנדב קודם, ולגרסה הנוכחית אם
// העמוד חזר מזיהוי-מחדש; למנהל — לקריאה), canRecut — אפשר לשלוח עכשיו לזיהוי-מחדש בלי מנהל, ו-now — שעון השרת
// (הדפדפן בוחר את הטיוטה החדשה מבין המקומית לזו שבשרת — lib/pageProof/draftRules.pickDraft).
// "כבר הגיש" = הגשה לגרסה הנוכחית של העמוד: עמוד שחזר מזיהוי-מחדש (גרסה
// חדשה) נפתח לעריכה גם למי שהגיש את הגרסה הקודמת. בקשה לזיהוי-מחדש (recutRequest)
// אינה הגשה.
export async function GET(request, { params }) {
  const { session, userId, error } = await requireProofSession();
  if (error) return error;
  try {
    const { id } = await params;
    if (!mongoose.Types.ObjectId.isValid(id)) return badRequest('מזהה עמוד לא תקין');
    await connectDB();

    const [page, subs] = await Promise.all([
      PageProofPage.findById(id).lean(),
      PageProofSubmission.find({ page: id, user: userId, status: { $ne: 'rejected' }, recutRequest: { $ne: true } }, { ops: 1, status: 1, note: 1, revision: 1, createdAt: 1, round: 1 })
        .sort({ createdAt: -1 })
        .lean(),
    ]);
    if (!page) return notFound('העמוד לא נמצא');
    const revision = storedRevision(page);
    // ...ובסבב הנוכחי: עמוד שמנהל פתח מחדש אחרי אישור נפתח לעריכה גם למי שהגיש את הגרסה שאושרה
    const mine = subs.find((s) => sameRevision(submissionRevision(s), revision) && sameRound(s, page)) || null;

    let mode = 'view';
    let leasedUntil = null;
    if (!mine) {
      const renewed = await renewLease(id, userId);
      if (renewed) {
        mode = 'edit';
        leasedUntil = renewed.leasedUntil || null;
      }
      else if (!hasOcrAccess(session.user.role)) return forbidden('העמוד הזה אינו בטיפולכם — אפשר לתפוס אותו ברשת-העמודים של הספר');
    }

    const [book, recut] = await Promise.all([PageProofBook.findById(page.book, { title: 1, script: 1 }).lean(), recutStatus()]);
    const admin = hasOcrAccess(session.user.role);
    const ctx = await editorContext(page, userId, { edit: mode === 'edit', admin, userName: session.user.name || '', recutOn: recut.effective });
    return NextResponse.json(
      {
        success: true,
        mode,
        page: editorPageShape(page, book),
        submission: mine ? { id: String(mine._id), status: mine.status, ops: mine.ops, note: mine.note, createdAt: mine.createdAt || null } : null,
        // עד מתי העמוד שמור למתנדב אחרי הפתיחה הזו ("שמור לך עד …") — רק בעריכה
        leasedUntil,
        // "שלח לזיהוי-מחדש" פתוח עכשיו? (מתג המנהל — runtime.recutStatus)
        recutRequests: recut.effective,
        draft: ctx.draft,
        canRecut: ctx.canRecut,
        now: new Date().toISOString(),
      },
      { headers: { 'Cache-Control': 'private, no-store' } }
    );
  } catch (e) {
    console.error('page-proof page GET', e);
    return serverError();
  }
}
