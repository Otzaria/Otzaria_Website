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

const UPLOAD_ROOT = process.env.UPLOAD_DIR || path.join(process.cwd(), 'public', 'uploads');

export async function POST(request) {
  try {
    const session = await getServerSession(authOptions);
    if (session?.user?.role !== 'admin') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    await connectDB();
    
    const formData = await request.formData();
    const file = formData.get('pdf');
    const bookName = formData.get('bookName');
    const category = formData.get('category') || 'כללי';

    if (!file || !bookName) {
      return NextResponse.json({ success: false, error: 'חסרים נתונים' }, { status: 400 });
    }

    // תיקון: יצירת Slug ששומר על עברית
    // במקום למחוק תווים לא לטיניים, נחליף רק רווחים וסימנים מיוחדים במקפים
    const safeName = bookName.trim().replace(/[\s\t\n]+/g, '-'); 
    // מוסיפים timestamp קצר למניעת כפילויות
    const slug = `${safeName}-${Date.now().toString().slice(-6)}`;
    
    const bookFolder = path.join(UPLOAD_ROOT, 'books', slug);
    
    await fs.ensureDir(bookFolder);

    const pdfBuffer = Buffer.from(await file.arrayBuffer());
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
      completedPages: 0
    });

    const pagesData = result.map((page, index) => ({
      book: newBook._id,
      pageNumber: index + 1,
      imagePath: `/uploads/books/${slug}/page.${index + 1}.jpg`,
      status: 'available'
    }));

    await Page.insertMany(pagesData);
    await fs.remove(tempPdfPath); 

    return NextResponse.json({ 
      success: true, 
      message: 'הספר הועלה ועובד בהצלחה',
      bookId: newBook._id 
    });

  } catch (error) {
    console.error('Upload Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}