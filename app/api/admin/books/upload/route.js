import { NextResponse } from 'next/server';
import { fromPath } from 'pdf2pic';
import path from 'path';
import fs from 'fs-extra';
import slugify from 'slugify';
import connectDB from '@/lib/db';
import Book from '@/models/Book';
import Page from '@/models/Page';

// הגדרת נתיב שמירה - בפרודקשן עדיף נתיב מחוץ לפרויקט שמוגש ע"י Nginx
const UPLOAD_DIR = process.env.NODE_ENV === 'production' 
  ? '/var/www/otzaria/uploads' 
  : path.join(process.cwd(), 'public', 'uploads');

export async function POST(request) {
  try {
    await connectDB();
    
    // 1. קבלת הנתונים
    const formData = await request.formData();
    const file = formData.get('pdf'); // קובץ ה-PDF
    const bookName = formData.get('bookName');

    if (!file || !bookName) {
      return NextResponse.json({ success: false, error: 'חסרים נתונים' }, { status: 400 });
    }

    // 2. הכנת תיקיות
    const slug = slugify(bookName, { lower: true, strict: true }) + '-' + Date.now();
    const bookFolder = path.join(UPLOAD_DIR, 'books', slug);
    await fs.ensureDir(bookFolder);

    // 3. שמירת קובץ ה-PDF זמנית
    const pdfBuffer = Buffer.from(await file.arrayBuffer());
    const tempPdfPath = path.join(bookFolder, 'source.pdf');
    await fs.writeFile(tempPdfPath, pdfBuffer);

    // 4. הגדרת המרה (PDF ל-Images)
    // הערה: דורש graphicsmagick ו-ghostscript מותקנים בשרת
    const options = {
      density: 150, // איכות
      saveFilename: "page",
      savePath: bookFolder,
      format: "jpg",
      width: 1200,
      height: 1600 
    };

    const convert = fromPath(tempPdfPath, options);
    
    // המרה בפועל (עשוי לקחת זמן לספרים גדולים)
    // בפרודקשן עדיף להריץ את זה כ-Job ברקע, אבל לכאן זה יספיק
    const result = await convert.bulk(-1, { responseType: "image" });
    
    if (!result || result.length === 0) {
      throw new Error('Conversion failed');
    }

    // 5. יצירת הספר ב-DB
    const newBook = await Book.create({
      name: bookName,
      slug: slug,
      folderPath: `/uploads/books/${slug}`, // נתיב יחסי ל-Web
      totalPages: result.length,
      category: 'כללי' // ברירת מחדל
    });

    // 6. יצירת העמודים ב-DB (Bulk Insert ליעילות)
    const pagesData = result.map((page, index) => ({
      book: newBook._id,
      pageNumber: index + 1,
      // שם הקובץ ש-pdf2pic מייצר הוא בד"כ page.1.jpg
      imagePath: `/uploads/books/${slug}/page.${index + 1}.jpg`,
      status: 'available'
    }));

    await Page.insertMany(pagesData);

    // 7. ניקוי קובץ ה-PDF המקורי (אופציונלי, לחסכון במקום)
    // await fs.remove(tempPdfPath); 

    return NextResponse.json({ 
      success: true, 
      bookId: newBook._id, 
      totalPages: result.length 
    });

  } catch (error) {
    console.error('Upload Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}