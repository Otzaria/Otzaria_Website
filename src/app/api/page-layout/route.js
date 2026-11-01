import { NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import connectDB from '@/lib/db';
import Page from '@/models/Page';
import Book from '@/models/Book';
import PageLayout from '@/models/PageLayout';
import { canViewPageContent, canWritePageLayout } from '@/lib/pageEditAccess';
import { apiError, badRequest, forbidden, notFound, serverError, unauthorized } from '@/lib/apiResponse';
import { inspectPageImage } from '@/lib/ocr/ocrPageData';
import { decodeBookPathParam, INVALID_BOOK_PATH_HE } from '@/lib/ocr/ocrDataQuery.pure';
import { PAGE_LAYOUT_LIMITS, displaySize, parseExpectedVersion, validatePageLayoutInput } from '@/lib/editor/pageLayoutValidation';

// GET /api/page-layout?pageId=... | ?bookPath=...&pageNumber=...
// PUT /api/page-layout  { pageId | bookPath+pageNumber, source, size:[w,h], lines:[...], expectedVersion? }
//
// תיבות שורות/מילים שמורות לעמוד בלי פריסת OCR (מודל PageLayout; תוכנית העורך §5.1) — זיהוי מקומי
// בדפדפן (useLocalWordBoxes), פרופיל הקרנה או סרגל ידני. נתיב פנימי בלבד (לא נצרך ע"י אפליקציית
// שולחן העבודה או העובד), ולכן בצורת השגיאות של apiResponse.ts ({ error } בעברית).
//
// הרשאה: session חובה (401), ואז אותו כלל עמוד כמו /api/page-content (canViewPageContent): עמוד
// פנוי — כל משתמש מחובר; בטיפול/הושלם — מי שתפס אותו או מנהל ספרים (hasBooksAccess) → אחרת 403.
// כתיבה (PUT) מחמירה יותר (canWritePageLayout): רק מי שתפס את העמוד או מנהל ספרים — גם עמוד פנוי
// לא פתוח לכתיבת תיבות לכל משתמש מחובר → 403.
// requireAccess אינו מתאים כאן: ההרשאה תלויה בעמוד ולא רק בתפקיד (מתנדב רגיל הוא המשתמש העיקרי).
// תמיד private, no-store — התשובה תלויה בזהות הצופה ובעמוד.
//
// GET 200: { success, data: { pageId, pageNumber, version,       // 0 = אין רשומה (ל-expectedVersion)
//   stale,                                                      // יש רשומה אבל התמונה הוחלפה מאז — או שאי אפשר
//                                                               // לוודא שלא (חסר hash בשמירה או עכשיו)
//   verified,                                                   // false = הרשומה לא אומתה מול hash התמונה
//   image: { sha256, width, height, matches },                  // ממדים בכיוון התצוגה (אחרי EXIF)
//   layout: null | { source, size, lines, wordCount, version, updatedAt } } }   // null גם כש-stale
// PUT 200: { success, data: { version, wordCount, updatedAt } }. 400 ולידציה, 409 התנגשות גרסה,
// 409 גם כשהלקוח שלח imageSha256 (ה-hash שקיבל ב-GET ושעליו חישב) והתמונה הוחלפה מאז, 413 גוף גדול מדי.

const NO_STORE = 'private, no-store';
const noStore = (res) => {
  res.headers.set('Cache-Control', NO_STORE);
  return res;
};
const ok = (data) => NextResponse.json({ success: true, data }, { headers: { 'Cache-Control': NO_STORE } });
const MISSING_ID = 'חסר מזהה עמוד או נתיב ספר ומספר עמוד';
const CONFLICT = 'התיבות של העמוד עודכנו בינתיים — טען את העמוד מחדש ונסה שוב';
const IMAGE_CHANGED = 'תמונת העמוד הוחלפה מאז שהתיבות חושבו — טען את העמוד מחדש ונסה שוב';
const PAGE_FIELDS = '_id book pageNumber status claimedBy imagePath';

async function findPage({ pageId, bookPath, pageNumber: pageNumberRaw }) {
  if (pageId) {
    if (typeof pageId !== 'string' || !mongoose.isValidObjectId(pageId)) return { error: badRequest('מזהה עמוד לא תקין') };
    return { page: await Page.findById(pageId).select(PAGE_FIELDS).lean() };
  }
  const pageNumber = Number(pageNumberRaw);
  if (typeof bookPath !== 'string' || !bookPath || pageNumberRaw == null || pageNumberRaw === '' || !Number.isSafeInteger(pageNumber) || pageNumber < 1) {
    return { error: badRequest(MISSING_ID) };
  }
  const decodedPath = decodeBookPathParam(bookPath);
  if (decodedPath === null) return { error: badRequest(INVALID_BOOK_PATH_HE) };
  const book = await Book.findOne({ $or: [{ slug: decodedPath }, { name: decodedPath }] }).select('_id').lean();
  if (!book) return { page: null };
  return { page: await Page.findOne({ book: book._id, pageNumber }).select(PAGE_FIELDS).lean() };
}

// עמוד + בדיקת גישה; מחזיר { page } או { response }
async function loadAccessiblePage(ids, user) {
  const found = await findPage(ids);
  if (found.error) return { response: found.error };
  if (!found.page) return { response: notFound('העמוד לא נמצא') };
  const access = canViewPageContent(found.page, user);
  if (!access.ok) return { response: forbidden(access.error) };
  return { page: found.page };
}

// גוף הבקשה כטקסט, או null אם עבר את maxBytes (הקריאה נעצרת והזרם מבוטל)
async function readBodyLimited(request, maxBytes) {
  if (!request.body) return '';
  const reader = request.body.getReader();
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks.map((c) => Buffer.from(c.buffer, c.byteOffset, c.byteLength))).toString('utf8');
}

// רשומה "טרייה" רק כשה-hash נשמר וגם מחושב עכשיו, והם שווים. בלי אחד מהם אי אפשר לדעת שהתמונה
// לא הוחלפה (אותו נתיב, קובץ אחר) — לא מגישים תיבות שאולי לא מתאימות לה.
const isVerified = (stored, image) => Boolean(stored.imageSha256 && image?.sha256 && stored.imageSha256 === image.sha256);
const isStale = (stored, page, image) => stored.imagePath !== page.imagePath || !isVerified(stored, image);

export async function GET(request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return noStore(unauthorized());

    const { searchParams } = new URL(request.url);
    const ids = { pageId: searchParams.get('pageId'), bookPath: searchParams.get('bookPath'), pageNumber: searchParams.get('pageNumber') };
    if (!ids.pageId && !(ids.bookPath && ids.pageNumber)) return noStore(badRequest(MISSING_ID));

    await connectDB();
    const { page, response } = await loadAccessiblePage(ids, session.user);
    if (response) return noStore(response);

    const stored = await PageLayout.findOne({ page: page._id }).lean();
    // בעמוד שעדיין אין לו layout אין מה לאמת: אל תקרא ותגבב את קובץ הסריקה בכל
    // כניסה לעורך. inspectImage=1 נשלח רק כשהמשתמש מתחיל זיהוי, כדי לקבע hash סמוך
    // לטעינת התמונה ולשמור על ההגנה מפני החלפתה באמצע.
    const inspectImage = searchParams.get('inspectImage') === '1';
    const image = stored || inspectImage ? await inspectPageImage(page.imagePath) : null;
    const size = displaySize(image);
    const stale = stored ? isStale(stored, page, image) : false;
    return ok({
      pageId: String(page._id),
      pageNumber: page.pageNumber,
      version: stored?.version ?? 0,
      stale,
      verified: stored ? isVerified(stored, image) : false,
      image: {
        sha256: image?.sha256 ?? null,
        width: size?.[0] ?? null,
        height: size?.[1] ?? null,
        matches: stored && stored.imageSha256 && image?.sha256 ? stored.imageSha256 === image.sha256 : null,
      },
      layout:
        stored && !stale
          ? { source: stored.source, size: stored.size, lines: stored.lines, wordCount: stored.wordCount, version: stored.version, updatedAt: stored.updatedAt }
          : null,
    });
  } catch (error) {
    console.error('Page layout GET error:', error);
    return noStore(serverError());
  }
}

export async function PUT(request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return noStore(unauthorized());

    const declared = Number(request.headers.get('content-length'));
    if (Number.isFinite(declared) && declared > PAGE_LAYOUT_LIMITS.maxBodyBytes) return noStore(apiError(413, 'גוף הבקשה גדול מדי'));
    // קריאה עם מונה בתים — גוף chunked (בלי content-length) לא נקרא כולו לזיכרון מעבר למגבלה
    const raw = await readBodyLimited(request, PAGE_LAYOUT_LIMITS.maxBodyBytes);
    if (raw === null) return noStore(apiError(413, 'גוף הבקשה גדול מדי'));
    let body;
    try {
      body = JSON.parse(raw);
    } catch {
      return noStore(badRequest('גוף הבקשה אינו JSON תקין'));
    }
    if (!body || typeof body !== 'object' || Array.isArray(body)) return noStore(badRequest('גוף הבקשה אינו תקין'));
    if (!body.pageId && !(body.bookPath && body.pageNumber)) return noStore(badRequest(MISSING_ID));
    const expected = parseExpectedVersion(body.expectedVersion);
    if (!expected.ok) return noStore(badRequest(expected.error));

    await connectDB();
    const { page, response } = await loadAccessiblePage(
      { pageId: body.pageId, bookPath: body.bookPath, pageNumber: body.pageNumber == null ? null : String(body.pageNumber) },
      session.user
    );
    if (response) return noStore(response);
    const write = canWritePageLayout(page, session.user);
    if (!write.ok) return noStore(forbidden(write.error));

    const image = await inspectPageImage(page.imagePath);
    // הלקוח חישב את התיבות על התמונה שה-hash שלה קיבל ב-GET; אם הוחלפה מאז — התיבות לא שלה
    if (body.imageSha256 != null && (typeof body.imageSha256 !== 'string' || !/^[0-9a-f]{64}$/i.test(body.imageSha256))) {
      return noStore(badRequest('hash התמונה אינו תקין'));
    }
    if (typeof body.imageSha256 === 'string' && image?.sha256 && body.imageSha256.toLowerCase() !== image.sha256) {
      // code — כדי שהלקוח יבחין בין זה להתנגשות גרסה (שתיהן 409)
      return noStore(NextResponse.json({ error: IMAGE_CHANGED, code: 'image-changed' }, { status: 409 }));
    }
    const parsed = validatePageLayoutInput(body, { expectedSize: displaySize(image) });
    if (!parsed.ok) return noStore(badRequest(parsed.error));
    const { source, size, lines, wordCount } = parsed.value;

    // inspectPageImage עשוי לקרוא ולגבב קובץ גדול. בדוק את הרשאת הכתיבה שוב מיד לפני
    // העדכון, כדי שהעברת העמוד למשתמש אחר בזמן החישוב תבטל את הבקשה הישנה.
    const currentPage = await Page.findById(page._id).select(PAGE_FIELDS).lean();
    if (!currentPage) return noStore(notFound('העמוד לא נמצא'));
    const currentWrite = canWritePageLayout(currentPage, session.user);
    if (!currentWrite.ok) return noStore(forbidden(currentWrite.error));
    if (currentPage.imagePath !== page.imagePath) {
      return noStore(NextResponse.json({ error: IMAGE_CHANGED, code: 'image-changed' }, { status: 409 }));
    }

    const rawUserId = session.user._id || session.user.id;
    const userId = rawUserId && mongoose.isValidObjectId(rawUserId) ? new mongoose.Types.ObjectId(String(rawUserId)) : undefined;
    const fields = { book: currentPage.book, imagePath: currentPage.imagePath, imageSha256: image?.sha256 ?? null, source, size, lines, wordCount, updatedBy: userId };
    const update = { $set: fields, $inc: { version: 1 }, $setOnInsert: { createdBy: userId } };
    const opts = { returnDocument: 'after', runValidators: true, lean: true, projection: { version: 1, wordCount: 1, updatedAt: 1 } };

    let saved;
    try {
      if (expected.value === undefined) {
        saved = await PageLayout.findOneAndUpdate({ page: page._id }, update, { ...opts, upsert: true, setDefaultsOnInsert: false });
      } else if (expected.value === 0) {
        // "אין עדיין רשומה": הכנסה בלבד — רשומה קיימת → מפתח כפול → 409
        saved = await PageLayout.findOneAndUpdate({ page: page._id, version: { $exists: false } }, update, { ...opts, upsert: true, setDefaultsOnInsert: false });
      } else {
        saved = await PageLayout.findOneAndUpdate({ page: page._id, version: expected.value }, update, opts);
      }
    } catch (e) {
      if (e?.code === 11000) return noStore(apiError(409, CONFLICT));
      if (e?.name === 'ValidationError') return noStore(badRequest('נתוני התיבות אינם תקינים'));
      throw e;
    }
    if (!saved) return noStore(apiError(409, CONFLICT));
    return ok({ version: saved.version, wordCount: saved.wordCount, updatedAt: saved.updatedAt });
  } catch (error) {
    console.error('Page layout PUT error:', error);
    return noStore(serverError());
  }
}
