// Uploads/storage are supplied by the live installation, not bundled build assets.
import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import Book from '@/models/Book';
import Page from '@/models/Page';
import OcrPageResult from '@/models/OcrPageResult';
import fs from 'fs-extra';
import path from 'path';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { hasBookLibraryAccess } from '@/lib/roles';
import { CACHE_TAGS, revalidateNow } from '@/lib/cacheTags';
import { badRequest, notFound, requireAccess, serverError } from '@/lib/apiResponse';
import {
    BOOK_APPLY_IN_PROGRESS_MESSAGE_HE,
    cancelActiveOcrForBook,
    cancelLateOcrJobsQuiet,
    isOcrApplyInProgress,
} from '@/lib/ocr/localCancel';

export async function DELETE(request) {
    try {
        // 1. אבטחה: בדיקת הרשאות אדמין
        const session = await getServerSession(authOptions);
        const denied = requireAccess(session, hasBookLibraryAccess);
        if (denied) return denied;

        const { bookId } = await request.json();
        if (!bookId) {
            return badRequest('Book ID is required');
        }

        await connectDB();

        const book = await Book.findById(bookId);
        if (!book) return notFound('Book not found');

        // ביטול מתועד של עבודת OCR פעילה — לפני שנמחק דבר (לא העלמה שקטה). רשומות OcrJob
        // נשמרות כהיסטוריה. אם קליטת תוצאה מקומית כבר בעיצומה — 409 ולא נמחק כלום.
        const cancelOpts = { reason: 'book_deleted', byName: session.user?.name || '' };
        try {
            await cancelActiveOcrForBook(book._id, cancelOpts);
        } catch (err) {
            if (isOcrApplyInProgress(err)) {
                return NextResponse.json(
                    { error: BOOK_APPLY_IN_PROGRESS_MESSAGE_HE, code: 'apply_started' },
                    { status: 409 }
                );
            }
            throw err;
        }

        // 2. מחיקת קבצים פיזיים (רק אם קיים נתיב)
        if (book.folderPath) {
            const relativePath = book.folderPath.startsWith('/') ? book.folderPath.slice(1) : book.folderPath;
            const baseUploadDir = path.resolve(/*turbopackIgnore: true*/ process.cwd(), 'public', 'uploads');
            const fullPath = path.resolve(/*turbopackIgnore: true*/ process.cwd(), 'public', relativePath);

            // אימות בטיחות נתיב (Path Traversal Protection)
            if (fullPath.startsWith(baseUploadDir + path.sep)) {
                if (await fs.pathExists(/*turbopackIgnore: true*/ fullPath)) {
                    await fs.remove(fullPath);
                }
            } else {
                console.error("Security alert: Attempt to delete unauthorized path:", fullPath);
                // כאן אפשר להחליט אם לעצור או רק להתריע
            }
        }

        // 3. מחיקת כל העמודים המשויכים לספר מה-DB (קורה תמיד!)
        await Page.deleteMany({ book: bookId });
        // נתוני OCR מקומי לעמודים (layout/metadata — נשמרים לצמיתות, נמחקים רק עם הספר)
        await OcrPageResult.deleteMany({ book: bookId });

        // 4. מחיקת רשומת הספר עצמה מה-DB (קורה תמיד!)
        await Book.findByIdAndDelete(bookId);

        // עבודה שהתחילה בין הביטול למחיקת הספר — מבוטלת גם היא (לא זורק)
        await cancelLateOcrJobsQuiet([book._id], cancelOpts);

        revalidateNow(CACHE_TAGS.BOOKS_ADMIN_LIST);

        return NextResponse.json({ success: true, message: 'הספר נמחק בהצלחה' });

    } catch (error) {
        console.error('Delete book error:', error);
        return serverError('Internal Server Error');
    }
}