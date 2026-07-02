import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import Book from '@/models/Book';
import Page from '@/models/Page';
import fs from 'fs-extra';
import path from 'path';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { hasBookLibraryAccess } from '@/lib/roles';

export async function DELETE(request) {
    try {
        // 1. אבטחה: בדיקת הרשאות אדמין
        const session = await getServerSession(authOptions);
        if (!session || !hasBookLibraryAccess(session.user?.role)) {
            return NextResponse.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
        }

        const { bookId } = await request.json();
        if (!bookId) {
            return NextResponse.json({ error: 'Book ID is required' }, { status: 400 });
        }

        await connectDB();

        const book = await Book.findById(bookId);
        if (!book) return NextResponse.json({ error: 'Book not found' }, { status: 404 });

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

        return NextResponse.json({ success: true, message: 'הספר נמחק בהצלחה' });

    } catch (error) {
        console.error('Delete book error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}