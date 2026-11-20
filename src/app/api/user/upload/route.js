// Uploads/storage are supplied by the live installation, not bundled build assets.
import { NextResponse } from 'next/server';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import fs from 'fs-extra';
import slugify from 'slugify';
import { privateBookRoot } from '@/lib/ocr/privateBookStorage';
import { hasPrivateOcrAccess } from '@/lib/roles';
import { checkRateLimit } from '@/lib/rate-limit';
import { getClientIp } from '@/lib/client-ip';
import connectDB from '@/lib/db';
import Book from '@/models/Book';
import Page from '@/models/Page';
import User from '@/models/User';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { convertPdfToImages } from '@/lib/pdfConverter';
import { CACHE_TAGS, revalidateNow } from '@/lib/cacheTags';
import { badRequest, apiError, requireAccess, serverError, unauthorized } from '@/lib/apiResponse';

const UPLOAD_ROOT = process.env.UPLOAD_DIR || path.join(/*turbopackIgnore: true*/ process.cwd(), 'public', 'uploads');
const MAX_PRIVATE_PDF_BYTES = 50 * 1024 * 1024;
const MAX_PRIVATE_PAGES = 2000;
const MAX_PRIVATE_BODY_BYTES = MAX_PRIVATE_PDF_BYTES + 64 * 1024;
const SIZE_MESSAGE = 'יש להעלות PDF עד 50MB ושם ספר עד 200 תווים';
const DUPLICATE_MESSAGE = 'ספר בשם זה כבר קיים במערכת, אנא בחרו שם אחר';

function uploadTooLarge() {
  return Object.assign(new Error(SIZE_MESSAGE), { code: 'PRIVATE_UPLOAD_LIMIT' });
}

async function privateFormData(request) {
  if (Number(request.headers.get('content-length')) > MAX_PRIVATE_BODY_BYTES) throw uploadTooLarge();
  let size = 0;
  const body = request.body?.pipeThrough(new TransformStream({
    transform(chunk, controller) {
      size += chunk.byteLength;
      if (size > MAX_PRIVATE_BODY_BYTES) throw uploadTooLarge();
      controller.enqueue(chunk);
    },
  }));
  try {
    return await new Response(body, { headers: request.headers }).formData();
  } catch (error) {
    if (error.code === 'PRIVATE_UPLOAD_LIMIT') throw error;
    throw Object.assign(new Error(SIZE_MESSAGE), { code: 'INVALID_PRIVATE_FORM' });
  }
}

async function prepareBook(request, privateOcr) {
  let createdBookId = null;
  let createdFolderPath = null;

  try {
    const session = await getServerSession(authOptions);
    if (privateOcr) {
      const denied = requireAccess(session, hasPrivateOcrAccess);
      if (denied) return denied;
    }
    const userId = session?.user?._id || session?.user?.id;
    if (!userId) return unauthorized();
    if (privateOcr && !checkRateLimit(getClientIp(request), 'private_ocr_upload', 10, 'hour')) {
      return apiError(429, 'יותר מדי העלאות. נסה שוב מאוחר יותר.');
    }

    const form = privateOcr ? await privateFormData(request) : await request.formData();
    const file = form.get('pdf');
    const bookName = form.get('bookName');
    if (!file || typeof file === 'string' || typeof bookName !== 'string' || !bookName.trim()) {
      return badRequest(privateOcr ? SIZE_MESSAGE : 'Missing data');
    }
    if (privateOcr && (bookName.length > 200 || file.type !== 'application/pdf' || file.size > MAX_PRIVATE_PDF_BYTES)) {
      return badRequest(SIZE_MESSAGE);
    }

    await connectDB();
    const slug = privateOcr
      ? randomUUID()
      : ('u-' + String(userId).slice(-4) + '-' + slugify(bookName, { remove: /[*+~.()'"!:@\/\\?]/g })).replace(/-+$/, '');
    if (!privateOcr && await Book.exists({ slug })) return apiError(409, DUPLICATE_MESSAGE);

    const root = privateOcr ? privateBookRoot() : path.join(/*turbopackIgnore: true*/ UPLOAD_ROOT, 'books');
    const folder = path.join(/*turbopackIgnore: true*/ root, slug);
    await fs.ensureDir(/*turbopackIgnore: true*/ root);
    // כל בקשה מקבלת בעלות על תיקייה חדשה ורק היא רשאית לנקות אותה במקרה כשל.
    try {
      await fs.mkdir(/*turbopackIgnore: true*/ folder, privateOcr ? { mode: 0o700 } : undefined);
    } catch (error) {
      if (error.code === 'EEXIST') return apiError(409, DUPLICATE_MESSAGE);
      throw error;
    }
    createdFolderPath = folder;

    const pdfPath = path.join(/*turbopackIgnore: true*/ folder, 'source.pdf');
    await fs.writeFile(/*turbopackIgnore: true*/ pdfPath, Buffer.from(await file.arrayBuffer()));
    const images = await convertPdfToImages(pdfPath, folder, privateOcr ? { maxPages: MAX_PRIVATE_PAGES } : undefined);
    if (!images?.length) throw new Error('Conversion failed');
    await fs.remove(/*turbopackIgnore: true*/ pdfPath);

    const folderPath = `${privateOcr ? '/private-books' : '/uploads/books'}/${slug}`;
    const book = await Book.create({
      name: bookName,
      slug,
      category: `אישי - ${session.user.name || 'משתמש'}`,
      folderPath,
      totalPages: images.length,
      completedPages: 0,
      isHidden: true,
      isPrivate: true,
      ...(privateOcr ? { privateOcr: true } : {}),
      ownerId: userId,
      originalOwnerId: userId,
    });
    createdBookId = book._id;
    const claimedAt = new Date();
    await Page.insertMany(images.map((_, index) => ({
      book: book._id,
      pageNumber: index + 1,
      imagePath: `${folderPath}/page.${index + 1}.jpg`,
      ...(privateOcr ? { status: 'available' } : { status: 'in-progress', claimedBy: userId, claimedAt }),
    })));
    if (!privateOcr) {
      await User.findByIdAndUpdate(userId, { $addToSet: { hiddenInstructionsBooks: String(book._id) } });
    }
    revalidateNow(CACHE_TAGS.BOOKS_ADMIN_LIST);

    return NextResponse.json({
      success: true,
      message: privateOcr ? 'הספר הפרטי הועלה בהצלחה' : 'Upload and conversion successful',
      bookId: book._id,
      slug,
    });
  } catch (error) {
    const rollback = [];
    if (createdBookId) {
      rollback.push(Page.deleteMany({ book: createdBookId }), Book.findByIdAndDelete(createdBookId));
    }
    if (createdFolderPath) rollback.push(fs.remove(/*turbopackIgnore: true*/ createdFolderPath));
    for (const attempt of await Promise.allSettled(rollback)) {
      if (attempt.status === 'rejected') console.error('Book upload rollback failed:', attempt.reason);
    }

    if (error.code === 'INVALID_PRIVATE_FORM') return badRequest(SIZE_MESSAGE);
    if (error.code === 'PRIVATE_UPLOAD_LIMIT') return apiError(413, SIZE_MESSAGE);
    if (error.code === 'PDF_PAGE_LIMIT') return apiError(413, `הספר יכול להכיל עד ${MAX_PRIVATE_PAGES} עמודים`);
    if (error.code === 'PDF_CONVERSION_BUSY') {
      return NextResponse.json({ error: 'שרת ההמרה עמוס. נסה שוב מאוחר יותר.' }, { status: 503, headers: { 'Retry-After': '30' } });
    }
    console.error('USER UPLOAD ERROR:', error);
    return serverError(privateOcr ? 'שגיאה בהעלאת הספר' : error.message);
  }
}

export async function POST(request) {
  const privateOcr = new URL(request.url).searchParams.get('privateOcr') === '1';
  const response = await prepareBook(request, privateOcr);
  response.headers.set('Cache-Control', 'private, no-store');
  return response;
}
