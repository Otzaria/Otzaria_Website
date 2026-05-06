import { NextResponse } from 'next/server';
import { fromPath } from 'pdf2pic';
import path from 'path';
import fs from 'fs-extra';
import slugify from 'slugify';
import connectDB from '@/lib/db';
import Book from '@/models/Book';
import Page from '@/models/Page';
import User from '@/models/User';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';

const UPLOAD_ROOT = process.env.UPLOAD_DIR || path.join(process.cwd(), 'public', 'uploads');

export async function POST(request) {
  let createdBookId = null;
  let createdFolderPath = null;

  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id || session.user._id;

    await connectDB();
    
    const formData = await request.formData();
    const file = formData.get('pdf');
    const bookName = formData.get('bookName');

    const userName = session.user.name || 'משתמש';
    const category = `אישי - ${userName}`;

    if (!file || !bookName) {
      return NextResponse.json({ success: false, error: 'Missing data' }, { status: 400 });
    }

    let baseSlug = slugify(bookName, {
        replacement: '-',  
        remove: /[*+~.()'"!:@\/\\?]/g, 
        lower: false,      
        strict: false      
    });
    
    baseSlug = `u-${userId.toString().slice(-4)}-${baseSlug}`;
    const slug = baseSlug.replace(/^-+|-+$/g, '') || 'my-book';

    const existingBook = await Book.findOne({ slug: slug });
    const bookFolder = path.join(UPLOAD_ROOT, 'books', slug);
    const folderExists = await fs.pathExists(bookFolder);

    if (existingBook || folderExists) {
        return NextResponse.json({ 
            success: false, 
            error: 'ספר בשם זה כבר קיים במערכת, אנא בחרו שם אחר' 
        }, { status: 409 });
    }
    
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
      isHidden: true,
      isPrivate: true,
      ownerId: userId,
      originalOwnerId: userId
    });
    
    createdBookId = newBook._id;

    await User.findByIdAndUpdate(userId, {
        $addToSet: { hiddenInstructionsBooks: newBook._id.toString() }
    });

    const pagesData = result.map((page, index) => ({
      book: newBook._id,
      pageNumber: index + 1,
      imagePath: `/uploads/books/${slug}/page.${index + 1}.jpg`,
      status: 'in-progress',
      claimedBy: userId,
      claimedAt: new Date()
    }));

    await Page.insertMany(pagesData);
    await fs.remove(tempPdfPath);

    return NextResponse.json({ 
      success: true, 
      message: 'Upload and conversion successful',
      bookId: newBook._id,
      slug: slug
    });

  } catch (error) {
    console.error('USER UPLOAD ERROR:', error);

    try {
        if (createdBookId) {
            await Book.findByIdAndDelete(createdBookId);
            await Page.deleteMany({ book: createdBookId });
        }
        if (createdFolderPath && await fs.pathExists(createdFolderPath)) {
            await fs.remove(createdFolderPath);
        }
    } catch (cleanupError) {
        console.error('Rollback failed', cleanupError);
    }

    return NextResponse.json({ 
        success: false, 
        error: error.message 
    }, { status: 500 });
  }
}