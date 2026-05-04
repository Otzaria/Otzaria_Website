import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import DictaBook from '@/models/DictaBook';
import UploadEditCopy from '@/models/UploadEditCopy';
import Upload from '@/models/Upload';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { getUploadText } from '@/lib/gridfs-service';
import { hasBooksAccess } from '@/lib/roles';

const DEFAULT_REPO_URL = "https://raw.githubusercontent.com/Otzaria/otzaria-library/refs/heads/main";
const DEFAULT_FOLDER = "DictaToOtzaria/לא ערוך";

/**
 * איפוס עותק עריכה מההעלאות המקוריות
 */
async function resetEditCopyFromUploads(editCopy) {
  try {
    if (!editCopy.sourceUploadIds || editCopy.sourceUploadIds.length === 0) {
      return NextResponse.json({ 
        error: 'לא נמצאו העלאות מקוריות לאיפוס' 
      }, { status: 400 });
    }

    // שליפת כל ההעלאות המקוריות
    const uploads = await Upload.find({ 
      _id: { $in: editCopy.sourceUploadIds },
      isDeleted: false 
    }).sort({ createdAt: 1 });

    if (uploads.length === 0) {
      return NextResponse.json({ 
        error: 'ההעלאות המקוריות נמחקו או לא נמצאו' 
      }, { status: 404 });
    }

    // איחוד כל התוכן מחדש
    const parts = await Promise.all(uploads.map(upload => getUploadText(upload)));
    const combinedContent = parts.map((content, index) => {
      const separator = index < uploads.length - 1 ? '\n\n---\n\n' : '';
      return content + separator;
    }).join('');

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
    return NextResponse.json({ 
      error: 'שגיאה באיפוס עותק העריכה', 
      details: error.message 
    }, { status: 500 });
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
      return NextResponse.json({ 
        error: `שגיאה בהורדת הספר מגיטהאב (סטטוס: ${contentResp.status})`,
        details: `לא ניתן למצוא את הקובץ: ${fileName}`
      }, { status: 404 });
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
    return NextResponse.json({ 
      error: 'שגיאה באיפוס הספר מגיטהאב', 
      details: error.message 
    }, { status: 500 });
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
      return NextResponse.json({ error: 'אינך מורשה לבצע פעולה זו' }, { status: 401 });
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
      return NextResponse.json({ error: 'Book not found' }, { status: 404 });
    }

    // בדיקת הרשאות - רק תופס הספר או מנהל
    const isOwner = book.claimedBy?.toString() === userId;
    if (!isAdmin && !isOwner) {
      return NextResponse.json({ 
        error: 'אין הרשאה: רק תופס הספר או מנהל יכולים לאפס את הספר' 
      }, { status: 403 });
    }

    // אם זה עותק עריכה - נאפס מההעלאות המקוריות
    if (isEditCopy) {
      return await resetEditCopyFromUploads(book);
    }

    // אחרת - איפוס רגיל מגיטהאב
    return await resetDictaBookFromGithub(book);

  } catch (error) {
    console.error('Failed to reset book:', error);
    return NextResponse.json({ 
      error: 'שגיאה פנימית בשרת', 
      details: error.message 
    }, { status: 500 });
  }
}
