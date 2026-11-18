// Uploads/storage are supplied by the live installation, not bundled build assets.
import { NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs-extra';
import { randomUUID } from 'node:crypto';
import { privateBookRoot } from '@/lib/ocr/privateBookStorage';
import { hasPrivateOcrAccess } from '@/lib/roles';
import { checkRateLimit } from '@/lib/rate-limit';
import { getClientIp } from '@/lib/client-ip';
import connectDB from '@/lib/db';
import Book from '@/models/Book';
import Page from '@/models/Page';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { convertPdfToImages } from '@/lib/pdfConverter';
import { CACHE_TAGS, revalidateNow } from '@/lib/cacheTags';
import { badRequest, apiError, requireAccess, serverError } from '@/lib/apiResponse';
async function uploadPrivateBook(request) {
  let createdBookId = null;
  let createdFolderPath = null;

  try {
    const session = await getServerSession(authOptions);
    const denied = requireAccess(session, hasPrivateOcrAccess);
    if (denied) return denied;
    if (!checkRateLimit(getClientIp(request), 'private_ocr_upload', 10, 'hour')) return apiError(429, 'יותר מדי העלאות. נסה שוב מאוחר יותר.');

    const userId = session.user.id || session.user._id;

    await connectDB();
    
    const formData = await request.formData();
    const file = formData.get('pdf');
    const bookName = formData.get('bookName');

    const userName = session.user.name || 'משתמש';
    const category = `אישי - ${userName}`;

    if (!file || !bookName) {
      return badRequest('יש להעלות PDF עד 50MB ושם ספר עד 200 תווים');
    }

    if (typeof bookName !== 'string' || !bookName.trim() || bookName.length > 200) return badRequest('יש להעלות PDF עד 50MB ושם ספר עד 200 תווים');
    if (file.type !== 'application/pdf' || file.size > 50 * 1024 * 1024) return badRequest('יש להעלות PDF עד 50MB ושם ספר עד 200 תווים');
    const slug = randomUUID();
    const bookFolder = path.join(privateBookRoot(), slug);
    createdFolderPath = bookFolder;
    await fs.ensureDir(bookFolder);

    const arrayBuffer = await file.arrayBuffer();
    const pdfBuffer = Buffer.from(arrayBuffer);
    const tempPdfPath = path.join(bookFolder, 'source.pdf');
    await fs.writeFile(tempPdfPath, pdfBuffer);

    const result = await convertPdfToImages(tempPdfPath, bookFolder);

    if (!result || result.length === 0) {
      throw new Error('Conversion failed');
    }

    const newBook = await Book.create({
      name: bookName,
      slug: slug,
      category: category,
      folderPath: `/private-books/${slug}`,
      totalPages: result.length,
      completedPages: 0,
      isHidden: true,
      isPrivate: true,
      privateOcr: true,
      ownerId: userId,
      originalOwnerId: userId
    });
    
    createdBookId = newBook._id;

    const pagesData = result.map((page, index) => ({
      book: newBook._id,
      pageNumber: index + 1,
      imagePath: `/private-books/${slug}/page.${index + 1}.jpg`,
      status: 'available'
    }));

    await Page.insertMany(pagesData);
    await fs.remove(tempPdfPath);
    revalidateNow(CACHE_TAGS.BOOKS_ADMIN_LIST);

    return NextResponse.json({ 
      success: true, 
      message: 'הספר הפרטי הועלה בהצלחה',
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
        if (createdFolderPath && await fs.pathExists(/*turbopackIgnore: true*/ createdFolderPath)) {
            await fs.remove(createdFolderPath);
        }
    } catch (cleanupError) {
        console.error('Rollback failed', cleanupError);
    }

    if (error.code === 'PDF_CONVERSION_BUSY') { // נזהה עומס זמני בתור ההמרות החדש.
      return NextResponse.json({ error: 'שרת ההמרה עמוס. נסה שוב מאוחר יותר.' }, { status: 503, headers: { 'Retry-After': '30' } }); // נודיע שאפשר לנסות שוב לאחר המתנה.
    } // סוף הטיפול בעומס.

    return serverError('שגיאה בהעלאת הספר');
  }
}


export async function POST(request) {
  const response = await uploadPrivateBook(request);
  response.headers.set('Cache-Control', 'private, no-store');
  return response;
}
