import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import connectDB from "@/lib/db";
import DictaBook from "@/models/DictaBook";

// ייבוא הלוגיקה העסקית ממקור אמת אחד
import { 
  addPageNumberToHeadingDB,
  changeHeadingLevelDB,
  createHeadersDB,
  createSingleLetterHeadersDB,
  createPageBHeadersDB,
  replacePageBHeadersDB,
  emphasizeAndPunctuateDB,
  textCleanerDB,
  headerErrorCheckerDB
} from "../_lib";

import { dictaSync } from "@/lib/dicta/github-sync";

const toolHandlers = {
  "add-page-number": async (params) => {
    return addPageNumberToHeadingDB(
      params.book_id || params.bookId, 
      params.replace_with || params.replaceWith
    );
  },

  "change-heading-level": async (params) => {
    return changeHeadingLevelDB(
      params.book_id || params.bookId, 
      params.current_level || params.currentLevel, 
      params.new_level || params.newLevel
    );
  },

  "create-headers": async (params) => {
    return createHeadersDB(
      params.book_id || params.bookId, 
      params.find_word || params.findWord, 
      Number(params.end || params.endNumber || params.maxNum), 
      Number(params.level_num || params.level)
    );
  },

  "create-single-letter-headers": async (params) => {
    return createSingleLetterHeadersDB(
      params.book_id || params.bookId,
      params.start !== undefined ? params.start : params.startChar,
      params.end_suffix !== undefined ? params.end_suffix : params.endSuffix,
      Number(params.end || params.maxNum),
      Number(params.level_num || params.level),
      Array.isArray(params.ignore) ? params.ignore : [],
      Array.isArray(params.remove) ? params.remove : [],
      params.bold_only !== undefined ? params.bold_only : params.boldOnly
    );
  },

  "create-page-b-headers": async (params) => {
    return createPageBHeadersDB(
      params.book_id || params.bookId, 
      Number(params.header_level || params.level)
    );
  },

  "replace-page-b-headers": async (params) => {
    return replacePageBHeadersDB(
      params.book_id || params.bookId, 
      params.replace_type || params.replaceType
    );
  },

  "emphasize-and-punctuate": async (params) => {
    return emphasizeAndPunctuateDB(
      params.book_id || params.bookId, 
      params.add_ending || params.addEnding, 
      params.emphasize_start !== undefined ? params.emphasize_start : params.emphasizeStart
    );
  },

  "text-cleaner": async (params) => {
    return textCleanerDB(
      params.book_id || params.bookId, 
      params.options || {}
    );
  },

  "header-error-checker": async (params) => {
    return headerErrorCheckerDB(
      params.book_id || params.bookId,
      params.re_start || params.reStart,
      params.re_end || params.reEnd,
      params.gershayim !== undefined ? params.gershayim : params.isGershayim,
      params.is_shas !== undefined ? params.is_shas : params.isShas
    );
  },

  "dicta-sync": async (params) => {
    return dictaSync(params.folder_path || params.folderPath);
  }
};

/**
 * בדיקת הרשאות גישה לספר
 */
async function checkBookAccess(bookId, userId, isAdmin) {
  if (!bookId) return { allowed: true }; // כלים שלא דורשים ספר (כמו סנכרון)

  await connectDB();
  const book = await DictaBook.findById(bookId);
  
  if (!book) {
    return { allowed: false, error: "הספר לא נמצא" };
  }
  
  // ספר בסטטוס 'בטיפול' - רק לבעלים או לאדמין
  if (book.status === "in-progress") {
    const isOwner = book.claimedBy?.toString() === userId;
    if (!isAdmin && !isOwner) {
      return { allowed: false, error: "אין גישה: הספר נמצא בטיפול אצל משתמש אחר" };
    }
  }
  
  // ספר בסטטוס 'הושלם' - רק לאדמין (למנוע שינויים בטעות) או לבעלים המקורי
  if (book.status === "completed") {
     const isOwner = book.claimedBy?.toString() === userId;
     if (!isAdmin && !isOwner) {
        return { allowed: false, error: "הספר הושלם ונעול לעריכה" };
     }
  }
  
  return { allowed: true };
}

export async function POST(request) {
  try {
    // 1. אימות משתמש
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });
    }
    
    const user = session.user;
    const userId = user._id || user.id;
    const isAdmin = user.role === "admin";

    // 2. קריאת הבקשה
    const body = await request.json();
    const { tool, ...params } = body;

    if (!tool || typeof tool !== "string") {
      return NextResponse.json({ detail: "יש לציין את שם הכלי (tool)" }, { status: 400 });
    }

    const handler = toolHandlers[tool];
    if (!handler) {
      return NextResponse.json({ detail: `כלי לא מוכר: ${tool}` }, { status: 400 });
    }

    // 3. בדיקת הרשאות ספציפית לספר (תמיכה בשני הפורמטים של ה-ID)
    const currentBookId = params.book_id || params.bookId;
    
    if (currentBookId) {
      const access = await checkBookAccess(currentBookId, userId, isAdmin);
      if (!access.allowed) {
        return NextResponse.json({ detail: access.error }, { status: 403 });
      }
    } else if (tool === 'dicta-sync' && !isAdmin) {
        // רק אדמין יכול לבצע סנכרון מערכת
        return NextResponse.json({ detail: "פעולה זו מותרת למנהלים בלבד" }, { status: 403 });
    }

    // 4. הפעלת הכלי
    const result = await handler(params);
    return NextResponse.json(result);

  } catch (err) {
    console.error(`Error in tool execution:`, err);
    return NextResponse.json({ detail: err.message || "שגיאת שרת פנימית" }, { status: 500 });
  }
}