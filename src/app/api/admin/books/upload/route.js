import { NextResponse } from 'next/server';
import { fromPath } from 'pdf2pic';
import path from 'path';
import fs from 'fs-extra';
import slugify from 'slugify';
import connectDB from '@/lib/db';
import Book from '@/models/Book';
import Page from '@/models/Page';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { sendBookNotification } from '@/lib/emailService';
import { checkRateLimit } from '@/lib/rate-limit';
import { z } from 'zod';
import { hasBooksAccess } from '@/lib/roles';

// סכמת אימות להעלאת ספרים
const uploadBookSchema = z.object({
  bookName: z.string().min(1, 'שם הספר נדרש').max(200, 'שם הספר ארוך מדי'),
  category: z.string().max(100, 'קטגוריה ארוכה מדי').optional(),
  isHidden: z.boolean().optional(),
  sendNotification: z.boolean().optional()
});

function normalizeOptionalText(value) {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
}

const UPLOAD_ROOT = process.env.UPLOAD_DIR || path.join(process.cwd(), 'public', 'uploads');

export async function POST(request) {
  let createdBookId = null;
  let createdFolderPath = null;

  try {
    // 1. בדיקת סשן ותפקיד
    const session = await getServerSession(authOptions);
    if (!session || !hasBooksAccess(session.user?.role)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    // 2. Rate Limiting - מגבלה של 10 העלאות לשעה לאדמין
    const ip = request.headers.get("x-forwarded-for") || "unknown";
    const isAllowed = checkRateLimit(ip, 'admin_upload', 10, 'hour');
    
    if (!isAllowed) {
        return NextResponse.json(
            { error: 'יותר מדי העלאות. נסה שוב מאוחר יותר.' }, 
            { status: 429 }
        );
    }

    await connectDB();
    
    // 3. קבלת הנתונים מהבקשה
    const formData = await request.formData();
    const file = formData.get('pdf');
    const bookName = normalizeOptionalText(formData.get('bookName'));
    const category = normalizeOptionalText(formData.get('category')) || 'כללי';
    const isHidden = formData.get('isHidden') === 'true';
    const sendNotification = formData.get('sendNotification') === 'true';

    // 4. אימות קלט עם Zod
    const validationResult = uploadBookSchema.safeParse({
      bookName,
      category,
      isHidden,
      sendNotification
    });

    if (!validationResult.success) {
      const errors = validationResult.error.issues.map(err => err.message).join(', ');
      return NextResponse.json({ error: errors }, { status: 400 });
    }

    // 5. בדיקת קובץ
    if (!file || file.type !== 'application/pdf') {
      return NextResponse.json({ success: false, error: 'חובה להעלות קובץ PDF תקין' }, { status: 400 });
    }

    // 6. בדיקת גודל קובץ (מקסימום 50MB)
    const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ success: false, error: 'קובץ גדול מדי (מקסימום 50MB)' }, { status: 400 });
    }

    // יצירת שם תיקייה (Slug)
    let baseSlug = slugify(bookName, {
        replacement: '-',  
        remove: /[*+~.()'"!:@\/\\?]/g, 
        lower: false,      
        strict: false      
    });
    baseSlug = baseSlug.replace(/^-+|-+$/g, '') || 'book';

    let slug = baseSlug;
    let counter = 1;

    while (true) {
        const existingBook = await Book.findOne({ slug: slug });
        const folderExists = await fs.pathExists(path.join(UPLOAD_ROOT, 'books', slug));
        if (!existingBook && !folderExists) break;
        slug = `${baseSlug}-${counter}`;
        counter++;
    }
    
    const bookFolder = path.join(UPLOAD_ROOT, 'books', slug);
    createdFolderPath = bookFolder;
    await fs.ensureDir(bookFolder);

    const arrayBuffer = await file.arrayBuffer();
    const pdfBuffer = Buffer.from(arrayBuffer);
    const tempPdfPath = path.join(bookFolder, 'source.pdf');
    await fs.writeFile(tempPdfPath, pdfBuffer);

    const options = {
      density: 150,
      saveFilename: "page",
      savePath: bookFolder,
      format: "jpg",
      width: 1200,
      height: 1600 
    };

    const convert = fromPath(tempPdfPath, options);
    const result = await convert.bulk(-1, { responseType: "image" });
    
    if (!result || result.length === 0) {
      throw new Error('Conversion failed');
    }

    const newBook = await Book.create({
      name: bookName,
      slug: slug,
      category: category,
      folderPath: `/uploads/books/${slug}`,
      totalPages: result.length,
      completedPages: 0,
      isHidden: isHidden
    });
    
    createdBookId = newBook._id;

    const pagesData = result.map((page, index) => ({
      book: newBook._id,
      pageNumber: index + 1,
      imagePath: `/uploads/books/${slug}/page.${index + 1}.jpg`,
      status: 'available'
    }));

    await Page.insertMany(pagesData);
    await fs.remove(tempPdfPath); 

    if (sendNotification) {
      await sendBookNotification(bookName, slug);
    }

    return NextResponse.json({ 
      success: true, 
      message: 'הספר הועלה ועובד בהצלחה' + (sendNotification ? ' (נשלחו התראות)' : ''),
      bookId: newBook._id 
    });

  } catch (error) {
    console.error('CRITICAL UPLOAD ERROR:', error);

    // --- ROLLBACK PROCEDURE ---
    try {
        console.log('Starting Rollback...');

        // 1. מחיקת הספר מה-DB
        if (createdBookId) {
            await Book.findByIdAndDelete(createdBookId);
            console.log('- Deleted Book document');
            
            await Page.deleteMany({ book: createdBookId });
            console.log('- Deleted associated Page documents');
        }

        // 2. מחיקת התיקייה הפיזית
        if (createdFolderPath && await fs.pathExists(createdFolderPath)) {
            await fs.remove(createdFolderPath);
            console.log('- Deleted physical folder');
        }

        console.log('Rollback completed.');

    } catch (cleanupError) {
        console.error('Rollback failed! System may have orphan files.', cleanupError);
    }

    return NextResponse.json({ 
        success: false, 
        error: 'שגיאה בשרת. נסה שוב מאוחר יותר.' 
    }, { status: 500 });
  }
}
