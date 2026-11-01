import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import Page from '@/models/Page';
import Book from '@/models/Book';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { hasBooksAccess } from '@/lib/roles';
import { unauthorized, badRequest, notFound, forbidden, serverError } from '@/lib/apiResponse';

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

    const userId = session.user._id || session.user.id;
    const isAdmin = hasBooksAccess(session.user.role);

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

    // ביצוע העדכון
    const guardedQuery = hasSaveRevision
      ? {
          ...query,
          $or: [
            { contentSaveRevision: { $exists: false } },
            // שוויון הוא retry של אותה תמונת מצב (או התנגשות נדירה בין לשוניות), ולכן אידמפוטנטי
            // ואינו כותב שוב. אם הכתיבה הראשונה לא הגיעה ל-DB, הערך השמור עדיין קטן יותר.
            { contentSaveRevision: { $lt: body.saveRevision } },
          ],
        }
      : query;
    const updatedPage = await Page.findOneAndUpdate(
      guardedQuery,
      updateFields,
      { returnDocument: 'after' }
    );

    if (!updatedPage) {
      // העמוד כבר נטען ונבדק לעיל; כישלון העדכון המותנה פירושו ששמירה חדשה
      // יותר כבר הגיעה. מחזירים success אידמפוטנטי כדי שהלקוח לא יציג שגיאת שמירה.
      if (hasSaveRevision) {
        return NextResponse.json({ success: true, message: 'כבר נשמרה גרסה חדשה יותר', stale: true, pageStatus: currentPage.status });
      }
      return notFound('העמוד לא נמצא');
    }

    return NextResponse.json({ success: true, message: 'נשמר בהצלחה', pageStatus: updatedPage.status });
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
        const isAdmin = hasBooksAccess(session.user.role);

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
                id: page._id, // חשוב להחזיר ID לשימוש ב-Update
                content: page.content || '',
                isTwoColumns: page.isTwoColumns || false,
                twoColumns: page.isTwoColumns || false,
                rightColumn: page.rightColumn || '',
                leftColumn: page.leftColumn || '',
                rightColumnName: page.rightColumnName || 'חלק 1',
                leftColumnName: page.leftColumnName || 'חלק 2',
                status: page.status,
                claimedBy: page.claimedBy
            }
        });

    } catch (error) {
        console.error('Get Content Error:', error);
        return serverError();
    }
}
