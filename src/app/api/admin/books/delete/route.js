import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import Book from '@/models/Book';
import Page from '@/models/Page';
import fs from 'fs-extra';
import path from 'path';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { hasBookLibraryAccess } from '@/lib/roles';
import { CACHE_TAGS, revalidateNow } from '@/lib/cacheTags';
import { badRequest, notFound, requireAccess, serverError } from '@/lib/apiResponse';

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

        // 2. מחיקת קבצים פיזיים (רק אם קיים נתיב)
        if (book.folderPath) {
            const relativePath = book.folderPath.startsWith('/') ? book.folderPath.slice(1) : book.folderPath;
            const baseUploadDir = path.resolve(process.cwd(), 'public', 'uploads');
            const fullPath = path.resolve(process.cwd(), 'public', relativePath);

            // אימות בטיחות נתיב (Path Traversal Protection)
            if (fullPath.startsWith(baseUploadDir + path.sep)) {
                if (await fs.pathExists(fullPath)) {
                    await fs.remove(fullPath);
                }
            } else {
                console.error("Security alert: Attempt to delete unauthorized path:", fullPath);
                // כאן אפשר להחליט אם לעצור או רק להתריע
            }
        }

        // 3. מחיקת כל העמודים המשויכים לספר מה-DB (קורה תמיד!)
        await Page.deleteMany({ book: bookId });

        // 4. מחיקת רשומת הספר עצמה מה-DB (קורה תמיד!)
        await Book.findByIdAndDelete(bookId);

        revalidateNow(CACHE_TAGS.BOOKS_ADMIN_LIST);

        return NextResponse.json({ success: true, message: 'הספר נמחק בהצלחה' });

    } catch (error) {
        console.error('Delete book error:', error);
        return serverError('Internal Server Error');
    }
}