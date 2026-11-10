import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import Page from '@/models/Page';
import Book from '@/models/Book';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { hasBookLibraryAccess } from '@/lib/roles';
import { unauthorized, badRequest, notFound, forbidden, serverError } from '@/lib/apiResponse';
import { pageVersion, pageVersionGuard, sameSavedText } from '@/lib/offlineBooks/version';
import { ocrReviewRevision, validOcrReviewState } from '@/lib/editor/ocrReviewState';

// שמירת תוכן (Auto-save)
export async function POST(request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return unauthorized();

    const body = await request.json();
    const { 
        pageNumber, 
        content, 
        leftColumn, 
        rightColumn, 
        twoColumns,
        rightColumnName, 
        leftColumnName 
    } = body;

    // נוצר בזמן העריכה, ולא בזמן סיום הבקשה: מונע משמירה ישנה ואיטית
    // לדרוס keepalive/sendBeacon חדש. השדה אופציונלי לתאימות ללקוחות ישנים.
    const hasSaveRevision = body.saveRevision != null;
    if (hasSaveRevision && (!Number.isSafeInteger(body.saveRevision) || body.saveRevision < 1)) {
      return badRequest('גרסת השמירה אינה תקינה');
    }
    const offline = body.baseVersion !== undefined;
    if (offline && (!/^[a-f0-9]{64}$/.test(body.baseVersion) ||
        typeof body.offlineSaveId !== 'string' || !/^[a-f0-9-]{36}$/.test(body.offlineSaveId) ||
        !hasSaveRevision || typeof body.expectedUserId !== 'string' ||
        !['content', 'leftColumn', 'rightColumn', 'rightColumnName', 'leftColumnName'].every(k => typeof body[k] === 'string') ||
        typeof twoColumns !== 'boolean')) return badRequest('בקשת סנכרון לא תקינה');
    const hasWordReview = body.ocrWordReview !== undefined;
    if (hasWordReview && body.ocrWordReview !== null && !validOcrReviewState(body.ocrWordReview)) {
      return badRequest('סימון המילים התקינות אינו תקין');
    }

    const userId = session.user._id || session.user.id;
    const isAdmin = hasBookLibraryAccess(session.user.role);
    if (body.expectedUserId !== undefined && String(userId) !== body.expectedUserId) {
      return NextResponse.json({ error: 'יש להתחבר לחשבון שבו נערך העמוד', code: 'OFFLINE_ACCOUNT' }, { status: 403 });
    }

    await connectDB();

    let query = {};
    
    // ניסיון למצוא את העמוד לפי ID ישיר אם סופק
    if (body.pageId) {
        query = { _id: body.pageId };
    } 
    // אחרת, חיפוש לפי נתיב הספר ומספר העמוד
    else if (body.bookPath) {
        const decodedPath = decodeURIComponent(body.bookPath);
        
        const book = await Book.findOne({ 
            $or: [{ slug: decodedPath }, { name: decodedPath }] 
        });
        
        if (!book) throw new Error(`Book not found: ${decodedPath}`);
        query = { book: book._id, pageNumber: pageNumber };
    } else {
        throw new Error('Missing book identifier');
    }

    // שליפת העמוד הנוכחי לבדיקת הרשאות לפני עדכון
    const currentPage = await Page.findOne(query);
    if (!currentPage) return notFound('Page not found');
    const sourceBook = await Book.findById(currentPage.book);
    if (!sourceBook || ((sourceBook.isHidden || sourceBook.isPrivate) && !isAdmin && String(sourceBook.ownerId) !== String(userId))) return forbidden('אין הרשאות לצפייה בספר זה');

    // לוגיקת הרשאות ועדכון סטטוס:
    let updateFields = {
        content,
        isTwoColumns: twoColumns,
        rightColumn,
        leftColumn,
        rightColumnName,
        leftColumnName,
    };
    if (hasSaveRevision) updateFields.contentSaveRevision = body.saveRevision;

    // 1. אם הדף פנוי - המשתמש "תופס" אותו אוטומטית מעצם השמירה
    if (currentPage.status !== 'available') {
        const isOwner = currentPage.claimedBy?.toString() === userId;
        if (!isOwner && !isAdmin) {
            return forbidden('אין לך הרשאה לערוך דף זה');
        }
        // אם הדף Completed, אנחנו מאפשרים עריכה (תיקון טעויות) מבלי לשנות סטטוס, אלא אם נרצה אחרת.
        // הבקשה הייתה לאפשר עריכה "בלי להגדיר את הדף חזרה למצב עריכה", ולכן לא משנים את הסטטוס כאן.
    }

    const conflict = () => NextResponse.json({
      error: 'העמוד השתנה בשרת. הגרסה המקומית נשמרה במכשיר ולא הוחלפה.', code: 'OFFLINE_CONFLICT',
    }, { status: 409 });
    if (offline) {
      // Lost response: an exact retry of an acknowledged write is safe. A later edit is not.
      if (currentPage.lastOfflineSaveId === body.offlineSaveId && currentPage.lastOfflineSaveVersion === pageVersion(currentPage) && sameSavedText(currentPage, body)) {
        return NextResponse.json({ success: true, contentVersion: pageVersion(currentPage), pageStatus: currentPage.status });
      }
      if (pageVersion(currentPage) !== body.baseVersion) return conflict();
      updateFields.lastOfflineSaveId = body.offlineSaveId;
    }

    // החלטות "המילה תקינה": null מנקה אותן בכוונה (ניקוי מפורש). החלטות שאינן null נכתבות רק אם הן
    // מתאימות לגרסת הזיהוי הנוכחית; אחרת הן נזרקות — אבל תוכן העמוד נשמר תמיד (אסור לאבד עריכות
    // בגלל לשונית ישנה), והתשובה מסומנת ב-ocrWordReviewDropped כדי שהלקוח ינקה אותן.
    let ocrWordReviewDropped = false;
    let reviewGuard = null;
    if (hasWordReview) {
      if (body.ocrWordReview === null) {
        updateFields.ocrWordReview = null;
      } else if (body.ocrWordReview.revision !== ocrReviewRevision(currentPage)) {
        ocrWordReviewDropped = true;
      } else {
        updateFields.ocrWordReview = body.ocrWordReview;
        // אטומיות: אם הזיהוי/התמונה הוחלפו בין הקריאה לכתיבה, העדכון המותנה לא יתאים
        // (ערך חסר מתאים ל-null). ראו הניסיון החוזר בלי ההחלטות למטה.
        reviewGuard = {
          imagePath: currentPage.imagePath ?? null,
          lastOcrJobId: currentPage.lastOcrJobId ?? null,
          lastOcrResultSha256: currentPage.lastOcrResultSha256 ?? null,
          lastOcrAt: currentPage.lastOcrAt ?? null,
          lastOcrTextSha256: currentPage.lastOcrTextSha256 ?? null,
        };
      }
    }

    if (offline) updateFields.lastOfflineSaveVersion = pageVersion({ ...currentPage.toObject(), ...updateFields });

    // ביצוע העדכון
    const ownershipGuard = { status: currentPage.status, claimedBy: currentPage.claimedBy ?? null };
    const guardedQuery = offline
      ? { ...query, ...pageVersionGuard(currentPage) }
      : hasSaveRevision
      ? {
          ...query, ...ownershipGuard,
          $or: [
            { contentSaveRevision: { $exists: false } },
            // שוויון הוא retry של אותה תמונת מצב (או התנגשות נדירה בין לשוניות), ולכן אידמפוטנטי
            // ואינו כותב שוב. אם הכתיבה הראשונה לא הגיעה ל-DB, הערך השמור עדיין קטן יותר.
            { contentSaveRevision: { $lt: body.saveRevision } },
          ],
        }
      : { ...query, ...ownershipGuard };
    let updatedPage = await Page.findOneAndUpdate(
      reviewGuard ? { ...guardedQuery, ...reviewGuard } : guardedQuery,
      updateFields,
      { returnDocument: 'after' }
    );

    if (!updatedPage && reviewGuard) {
      // ההתאמה נכשלה: שמירה חדשה יותר (saveRevision) או שהזיהוי הוחלף בינתיים. מנסים שוב בלי
      // ההחלטות — אם הכשל היה בגלל saveRevision, גם הניסיון הזה יחזיר null והמסלול האידמפוטנטי למטה
      // יטפל בו; אם בגלל הזיהוי, התוכן נשמר וההחלטות נזרקות.
      const { ocrWordReview: _dropped, ...contentOnly } = updateFields;
      updatedPage = await Page.findOneAndUpdate(guardedQuery, contentOnly, { returnDocument: 'after' });
      if (updatedPage) ocrWordReviewDropped = true;
    }

    if (!updatedPage) {
      // העמוד כבר נטען ונבדק לעיל; כישלון העדכון המותנה פירושו ששמירה חדשה
      // יותר כבר הגיעה. מחזירים success אידמפוטנטי כדי שהלקוח לא יציג שגיאת שמירה.
      if (offline) return conflict();
      if (hasSaveRevision) {
        const latest = await Page.findOne(query);
        if (!latest || latest.status !== currentPage.status || String(latest.claimedBy ?? '') !== String(currentPage.claimedBy ?? '')) return conflict();
        return NextResponse.json({ success: true, message: 'כבר נשמרה גרסה חדשה יותר', stale: true, pageStatus: currentPage.status, ...(ocrWordReviewDropped ? { ocrWordReviewDropped: true } : {}) });
      }
      return notFound('העמוד לא נמצא');
    }

    return NextResponse.json({ success: true, contentVersion: pageVersion(updatedPage), message: 'נשמר בהצלחה', pageStatus: updatedPage.status, ...(ocrWordReviewDropped ? { ocrWordReviewDropped: true } : {}) });
  } catch (error) {
    console.error('Save Content Error:', error);
    return serverError();
  }
}

// שליפת תוכן (טעינה בעת פתיחת העורך)
export async function GET(request) {
    try {
        const session = await getServerSession(authOptions);
        // מאפשרים כניסה רק למחוברים, אך הבדיקה הפרטנית תהיה למטה
        if (!session) return unauthorized();

        const userId = session.user._id || session.user.id;
        const isAdmin = hasBookLibraryAccess(session.user.role);

        const { searchParams } = new URL(request.url);
        const bookPath = searchParams.get('bookPath');
        const pageNumber = searchParams.get('pageNumber');

        if (!bookPath || !pageNumber) {
            return badRequest('Missing parameters');
        }

        await connectDB();

        const decodedPath = decodeURIComponent(bookPath);

        const book = await Book.findOne({
            $or: [{ slug: decodedPath }, { name: decodedPath }]
        });

        if (!book) {
            return notFound('Book not found');
        }

        const page = await Page.findOne({
            book: book._id,
            pageNumber: parseInt(pageNumber)
        });

        if (!page) {
            return notFound('Page not found');
        }

        if ((book.isHidden || book.isPrivate) && !isAdmin && String(book.ownerId) !== String(userId)) return forbidden('אין הרשאות לצפייה בספר זה');

        // --- בדיקת הרשאות צפייה/עריכה ---

        // 1. דף פנוי (Available) - כולם יכולים להיכנס
        if (page.status === 'available') {
            // הגישה מותרת
        }
        // 2. דף בטיפול (In-Progress) - רק הבעלים והמנהלים
        else if (page.status === 'in-progress') {
            const isOwner = page.claimedBy?.toString() === userId;
            if (!isOwner && !isAdmin) {
                return forbidden('הדף נמצא בטיפול על ידי משתמש אחר');
            }
        }
        // 3. דף הושלם (Completed) - רק הבעלים והמנהלים (לצורך תיקונים)
        else if (page.status === 'completed') {
            const isOwner = page.claimedBy?.toString() === userId;
            if (!isOwner && !isAdmin) {
                return forbidden('הדף הושלם על ידי משתמש אחר ונעול לעריכה');
            }
        }

        // 3. החזרת הנתונים ללקוח
        return NextResponse.json({ 
            success: true, 
            data: {
                contentVersion: pageVersion(page),
                saveRevision: page.contentSaveRevision || 0,
                thumbnail: page.imagePath,
                id: page._id, // חשוב להחזיר ID לשימוש ב-Update
                content: page.content || '',
                isTwoColumns: page.isTwoColumns || false,
                twoColumns: page.isTwoColumns || false,
                rightColumn: page.rightColumn || '',
                leftColumn: page.leftColumn || '',
                rightColumnName: page.rightColumnName || 'חלק 1',
                leftColumnName: page.leftColumnName || 'חלק 2',
                status: page.status,
                claimedBy: page.claimedBy,
                ocrReviewRevision: ocrReviewRevision(page),
                ocrWordReview: page.ocrWordReview?.revision === ocrReviewRevision(page) ? page.ocrWordReview : null,
            }
        });

    } catch (error) {
        console.error('Get Content Error:', error);
        return serverError();
    }
}
