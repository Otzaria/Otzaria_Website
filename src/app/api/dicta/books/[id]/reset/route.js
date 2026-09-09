import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import DictaBook from '@/models/DictaBook';
import UploadEditCopy from '@/models/UploadEditCopy';
import Upload from '@/models/Upload';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { getUploadText } from '@/lib/gridfs-service';
import { hasBooksAccess } from '@/lib/roles';
import { combineUploadsContent } from '@/lib/uploadContent';
import { unauthorized, forbidden, badRequest, notFound, serverError } from '@/lib/apiResponse';

const DEFAULT_REPO_URL = "https://raw.githubusercontent.com/Otzaria/otzaria-library/refs/heads/main";
const DEFAULT_FOLDER = "DictaToOtzaria/לא ערוך";

/**
 * איפוס עותק עריכה מההעלאות המקוריות
 */
async function resetEditCopyFromUploads(editCopy) {
  try {
    if (!editCopy.sourceUploadIds || editCopy.sourceUploadIds.length === 0) {
      return badRequest('לא נמצאו העלאות מקוריות לאיפוס');
    }

    // שליפת כל ההעלאות המקוריות
    const uploads = await Upload.find({ 
      _id: { $in: editCopy.sourceUploadIds },
      isDeleted: false 
    }).sort({ createdAt: 1 });

    if (uploads.length === 0) {
      return notFound('ההעלאות המקוריות נמחקו או לא נמצאו');
    }

    // איחוד כל התוכן מחדש
    const parts = await Promise.all(uploads.map(upload => getUploadText(upload)));
    const combinedContent = combineUploadsContent(parts);

    // עדכון התוכן בעותק העריכה
    editCopy.content = combinedContent;
    editCopy.updatedAt = new Date();
    
    // הוספה להיסטוריה
    editCopy.history.push({
      timestamp: new Date(),
      description: `איפוס מ-${uploads.length} העלאות מקוריות`,
      editorId: null,
      editorName: 'מערכת',
    });
    
    await editCopy.save();

    return NextResponse.json({ 
      success: true, 
      message: `עותק העריכה אופס בהצלחה מ-${uploads.length} העלאות מקוריות`,
      book: editCopy.toObject()
    });

  } catch (error) {
    console.error('Failed to reset edit copy from uploads:', error);
    return serverError('שגיאה באיפוס עותק העריכה');
  }
}

/**
 * איפוס ספר דיקטה מגיטהאב
 */
async function resetDictaBookFromGithub(book) {
  try {
    const baseUrl = process.env.DICTA_GITHUB_REPO || DEFAULT_REPO_URL;

    // בניית שם הקובץ מתוך שם הספר
    // קודם ננסה למצוא את שם הקובץ המקורי מתוך list.txt
    const listUrl = `${baseUrl}/${DEFAULT_FOLDER}/list.txt`;
    const listResp = await fetch(listUrl);
    
    let fileName = null;
    
    if (listResp.ok) {
      const rawText = await listResp.text();
      const fileList = rawText
        .split(/\r?\n/)
        .map(line => line.trim())
        .filter(line => line.length > 0 && line.endsWith('.txt'));
      
      // חיפוש הקובץ שמתאים לשם הספר
      fileName = fileList.find(file => {
        const titleFromFile = file
          .replace(/\.txt$/i, '')
          .replace(/_/g, ' ')
          .trim();
        return titleFromFile === book.title;
      });
    }
    
    // אם לא מצאנו בlist.txt, ננסה לבנות את שם הקובץ
    if (!fileName) {
      fileName = `${book.title.replace(/\s+/g, '_')}.txt`;
    }
    
    const contentUrl = `${baseUrl}/${DEFAULT_FOLDER}/ספרים/אוצריא/${encodeURIComponent(fileName)}`;

    // משיכת התוכן מגיטהאב
    const contentResp = await fetch(contentUrl);
    
    if (!contentResp.ok) {
      return notFound(
        `שגיאה בהורדת הספר מגיטהאב (סטטוס: ${contentResp.status}) - לא ניתן למצוא את הקובץ: ${fileName}`
      );
    }

    const freshContent = await contentResp.text();

    // עדכון התוכן בספר
    book.content = freshContent;
    book.updatedAt = new Date();
    await book.save();

    return NextResponse.json({ 
      success: true, 
      message: 'הספר אופס בהצלחה ונתוניו נמשכו מחדש מגיטהאב',
      book: book.toObject()
    });

  } catch (error) {
    console.error('Failed to reset dicta book from github:', error);
    return serverError('שגיאה באיפוס הספר מגיטהאב');
  }
}

/**
 * איפוס ספר - משיכת נתונים מחדש מגיטהאב או מההעלאות המקוריות
 * רק תופס הספר או מנהל יכולים לבצע פעולה זו
 */
export async function POST(request, context) {
  const params = await context.params;
  
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return unauthorized('אינך מורשה לבצע פעולה זו');
    }

    const bookId = params.id;
    const userId = session.user.id;
    const isAdmin = hasBooksAccess(session.user.role);

    await connectDB();
    
    // ניסיון למצוא ב-DictaBook
    let book = await DictaBook.findById(bookId);
    let isEditCopy = false;
    
    // אם לא נמצא, ננסה ב-UploadEditCopy
    if (!book) {
      book = await UploadEditCopy.findById(bookId);
      isEditCopy = true;
    }

    if (!book) {
      return notFound('Book not found');
    }

    // בדיקת הרשאות - רק תופס הספר או מנהל
    const isOwner = book.claimedBy?.toString() === userId;
    if (!isAdmin && !isOwner) {
      return forbidden('אין הרשאה: רק תופס הספר או מנהל יכולים לאפס את הספר');
    }

    // אם זה עותק עריכה - נאפס מההעלאות המקוריות
    if (isEditCopy) {
      return await resetEditCopyFromUploads(book);
    }

    // אחרת - איפוס רגיל מגיטהאב
    return await resetDictaBookFromGithub(book);

  } catch (error) {
    console.error('Failed to reset book:', error);
    return serverError('שגיאה פנימית בשרת');
  }
}
