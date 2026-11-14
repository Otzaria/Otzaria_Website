import { NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import connectDB from '@/lib/db';
import Page from '@/models/Page';
import Book from '@/models/Book';
import { hasBookLibraryAccess } from '@/lib/roles';
import { canViewPageContent } from '@/lib/pageEditAccess';
import { badRequest, forbidden, notFound, requireAccess, serverError, unauthorized } from '@/lib/apiResponse';
import { loadOcrPageData, OCR_DATA_PAGE_FIELDS } from '@/lib/ocr/ocrPageData';
import { decodeBookPathParam, INVALID_BOOK_PATH_HE } from '@/lib/ocr/ocrDataQuery.pure';

// GET /api/page-content/ocr-data?pageId=... | ?bookPath=...&pageNumber=...  [&jobId=...]
// נתוני OCR מקומי לעמוד (נתיב פנימי — לא נצרך ע"י העובד או אפליקציית שולחן העבודה): נתוני הפריסה
// (layout v1), נתוני העזר והאזהרות של הרשומה הנוכחית (זו שהטקסט שלה נכתב לעמוד לאחרונה), ובדיקה
// שתמונת העמוד היא עדיין זו שנשלחה לעיבוד (image.matches). עם jobId — הרשומה של עבודה מסוימת
// (היסטוריה / התנגשות ממתינה), למנהלי ספרייה בלבד.
// הגישה לעמוד — אותו כלל כמו GET /api/page-content (canViewPageContent). תמיד private/no-store:
// התשובה תלויה בזהות הצופה ובעמוד.
// הקואורדינטות בכיוון האחסון של קובץ התמונה: כש-exifOrientation ≠ 1 יש להציג את התמונה עם
// image-orientation: none לצורך חפיפה (או לסובב בהתאם). דיוק המיפוי (toSource) מובטח ל-±1px בלבד
// (pdfium מותח את הרינדור בפיקסל בגדלים מסוימים) — הממשק לא יניח דיוק תת-פיקסלי.
//
// תשובה 200 (serializeOcrPageData ב-src/lib/ocr/ocrPageDataView.js):
//   { success:true, data:{ pageId, pageNumber,
//     state: 'current'|'pending_conflict'|'pending_cancelled'|'history', jobId, resultSha256, pipelineVersion, receivedAt,
//     contentMatchesOcr,            // sha256(Page.content) === textSha256 && !isTwoColumns (הטקסט לא נערך מאז)
//     image:{ expectedSha256, matches, width, height, exifOrientation, sizeMatches },
//                                   // matches/מידות null = התמונה לא נקראה (חסרה / מעל 64MB / שגיאה);
//                                   // matches:false = התמונה הוחלפה אחרי ה-OCR — הקואורדינטות אינן תקפות
//     layoutStatus: 'ok'|'absent'|'invalid'|'unsupported_version'|'too_large', layoutVersion,
//     layout,                       // layout v1 כמות שהוא, רק ב-ok (אחרת null); מיפוי לתמונה: ocrLayoutGeometry.js
//     metadata,                     // pages[].metadata או null
//     warnings:[{ code, message, source:'worker'|'site', labelHe }] } }
// שגיאות: 400/401/403/404/500 בצורה של apiResponse.ts ({ error } — הודעה בעברית). bookPath עם '%'
// פגום → 400 "נתיב ספר לא תקין".

const NO_STORE = 'private, no-store';
const noStore = (res) => {
  res.headers.set('Cache-Control', NO_STORE);
  return res;
};
const MISSING_ID = 'חסר מזהה עמוד או נתיב ספר ומספר עמוד';

async function findPage(searchParams) {
  const pageId = searchParams.get('pageId');
  const select = OCR_DATA_PAGE_FIELDS;
  if (pageId) {
    if (!mongoose.isValidObjectId(pageId)) return { error: badRequest('מזהה עמוד לא תקין') };
    return { page: await Page.findById(pageId).select(select).lean() };
  }
  const bookPath = searchParams.get('bookPath');
  const pageNumberRaw = searchParams.get('pageNumber');
  const pageNumber = Number(pageNumberRaw);
  if (!bookPath || !pageNumberRaw || !Number.isSafeInteger(pageNumber) || pageNumber < 1) {
    return { error: badRequest(MISSING_ID) };
  }
  // '%' פגום ב-bookPath → 400 (לא 500). שאר הפרמטרים אינם מפוענחים ידנית: pageId/jobId נבדקים
  // ב-isValidObjectId ו-pageNumber ב-Number, ו-URLSearchParams עצמו אינו זורק על '%' פגום.
  const decodedPath = decodeBookPathParam(bookPath);
  if (decodedPath === null) return { error: badRequest(INVALID_BOOK_PATH_HE) };
  const book = await Book.findOne({ $or: [{ slug: decodedPath }, { name: decodedPath }] }).select('_id').lean();
  if (!book) return { page: null };
  return { page: await Page.findOne({ book: book._id, pageNumber }).select(select).lean() };
}

export async function GET(request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return noStore(unauthorized());

    const { searchParams } = new URL(request.url);
    if (!searchParams.get('pageId') && !(searchParams.get('bookPath') && searchParams.get('pageNumber'))) {
      return noStore(badRequest(MISSING_ID));
    }
    const jobId = searchParams.get('jobId');
    if (jobId) {
      // רשומה של עבודה מסוימת (לא בהכרח הנוכחית) — כמו מסך ההתנגשויות
      const denied = requireAccess(session, hasBookLibraryAccess);
      if (denied) return noStore(denied);
      if (!mongoose.isValidObjectId(jobId)) return noStore(badRequest('מזהה עבודה לא תקין'));
    }

    await connectDB();

    const found = await findPage(searchParams);
    if (found.error) return noStore(found.error);
    const page = found.page;
    if (!page) return noStore(notFound('העמוד לא נמצא'));

    const access = canViewPageContent(page, session.user);
    if (!access.ok) return noStore(forbidden(access.error));

    const data = await loadOcrPageData({ page, jobId });
    if (!data) return noStore(notFound('אין נתוני OCR מקומי לטקסט הנוכחי של העמוד'));

    return NextResponse.json({ success: true, data }, { headers: { 'Cache-Control': NO_STORE } });
  } catch (error) {
    console.error('OCR page data error:', error);
    return noStore(serverError());
  }
}
