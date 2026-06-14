import { NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs-extra';
import slugify from 'slugify';
import connectDB from '@/lib/db';
import Book from '@/models/Book';
import Page from '@/models/Page';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { hasBooksAccess } from '@/lib/roles';

const UPLOAD_ROOT = path.resolve(process.env.UPLOAD_DIR || path.join(process.cwd(), 'public', 'uploads'));

export async function POST(request) {
    console.log('--- Starting Merge Process (Fix V2) ---');

    try {
        const session = await getServerSession(authOptions);
        if (!hasBooksAccess(session?.user?.role)) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        await connectDB();

        const body = await request.json();
        const { bookIds, newName, isHidden } = body;

        if (!bookIds || !Array.isArray(bookIds) || bookIds.length < 2) {
            return NextResponse.json({ error: 'יש לבחור לפחות 2 ספרים למיזוג' }, { status: 400 });
        }

        const existingName = await Book.findOne({ name: newName });
        if (existingName) {
            return NextResponse.json({ error: 'שם הספר כבר קיים במערכת' }, { status: 400 });
        }

        const oldBooks = await Book.find({ _id: { $in: bookIds } });
        const sortedOldBooks = bookIds.map(id => oldBooks.find(b => b._id.toString() === id)).filter(Boolean);

        if (sortedOldBooks.length < 2) {
            return NextResponse.json({ error: 'חלק מהספרים לא נמצאו' }, { status: 404 });
        }

        const safeName = slugify(newName, { replacement: '-', remove: /[*+~.()'"!:@\/\\?]/g, lower: false, strict: false });
        const sanitizedName = safeName.replace(/[^\w\u0590-\u05FF\-]/g, '');
        const slug = `${sanitizedName}-${Date.now().toString().slice(-6)}`;
        const newBookFolder = path.join(UPLOAD_ROOT, 'books', slug);
        const newRelativeFolderPath = `/uploads/books/${slug}`;

        await fs.ensureDir(newBookFolder);
        console.log(`Created folder: ${newBookFolder}`);

        const firstBook = sortedOldBooks[0];

        let newThumbnailPath = null;
        if (firstBook.thumbnail && firstBook.thumbnail.startsWith('/uploads/')) {
            try {
                const oldThumbName = path.basename(firstBook.thumbnail);
                // Decode URI to handle Hebrew chars in paths
                const decodedThumbPath = decodeURIComponent(firstBook.thumbnail);
                const absoluteOldThumbPath = path.join(process.cwd(), 'public', decodedThumbPath);

                if (await fs.pathExists(absoluteOldThumbPath)) {
                    await fs.copy(absoluteOldThumbPath, path.join(newBookFolder, oldThumbName));
                    newThumbnailPath = `${newRelativeFolderPath}/${oldThumbName}`;
                }
            } catch (e) {
                console.error('Thumbnail copy error:', e);
            }
        }

        const newBook = await Book.create({
            name: newName,
            slug: slug,
            category: firstBook.category || 'כללי',
            author: firstBook.author || '',
            description: `מיזוג של ספרים: ${sortedOldBooks.map(b => b.name).join(', ')}`,
            folderPath: newRelativeFolderPath,
            thumbnail: newThumbnailPath,
            totalPages: 0,
            completedPages: 0,
            isHidden: isHidden || false
        });

        console.log(`New book created: ${newBook.name} (${newBook._id})`);

        let globalPageCount = 0;
        let totalCompleted = 0;
        const newPagesData = [];

        for (const oldBook of sortedOldBooks) {
            console.log(`Processing book: ${oldBook.name}`);

            let pages = await Page.find({ bookId: oldBook._id }).sort({ pageNumber: 1 });
            if (pages.length === 0) {
                pages = await Page.find({ book: oldBook._id }).sort({ pageNumber: 1 });
            }

            console.log(`Found ${pages.length} pages.`);

            for (const page of pages) {
                globalPageCount++;

                const sourceImagePath = page.imagePath || page.path || page.url;

                if (!sourceImagePath) {
                    console.warn(`Page ${page._id} missing image path, skipping file copy.`);
                    continue;
                }

                const decodedSourcePath = decodeURIComponent(sourceImagePath);
                const oldAbsolutePath = path.join(process.cwd(), 'public', decodedSourcePath);

                const extension = path.extname(decodedSourcePath) || '.jpg';
                const newFileName = `page-${globalPageCount}${extension}`;
                const newAbsolutePath = path.join(newBookFolder, newFileName);
                const newRelativePath = `${newRelativeFolderPath}/${newFileName}`;

                // העתקה
                if (await fs.pathExists(oldAbsolutePath)) {
                    await fs.copy(oldAbsolutePath, newAbsolutePath);
                } else {
                    console.warn(`File missing on disk: ${oldAbsolutePath}`);
                }

                // הוספה למערך השמירה
                newPagesData.push({
                    book: newBook._id,
                    bookId: newBook._id,
                    pageNumber: globalPageCount,
                    imagePath: newRelativePath,
                    path: newRelativePath,
                    width: page.width || 0,
                    height: page.height || 0,
                    status: 'available'
                });
            }

            totalCompleted += (oldBook.completedPages || 0);
        }

        console.log(`Total pages to insert: ${newPagesData.length}`);

        if (newPagesData.length > 0) {
            await Page.insertMany(newPagesData);
            console.log('Pages inserted successfully.');
        }


        newBook.totalPages = globalPageCount;
        newBook.completedPages = totalCompleted;
        await newBook.save();


        for (const oldBook of sortedOldBooks) {
            // 1. מחיקת רשומות מה-DB
            await Page.deleteMany({ $or: [{ bookId: oldBook._id }, { book: oldBook._id }] });
            await Book.findByIdAndDelete(oldBook._id);

            // 2. טיפול במחיקת הקבצים הפיזיים
            const folderPathRaw = oldBook.folderPath || (oldBook.path ? `/uploads/books/${oldBook.path}` : null);

            if (folderPathRaw) {
                try {
                    const decodedFolder = decodeURIComponent(folderPathRaw);

                    // הסרת לוכסן התחלתי אם קיים כדי ש-join יעבוד נכון
                    const normalizedRelative = decodedFolder.startsWith('/') ? decodedFolder.slice(1) : decodedFolder;

                    // בניית נתיב מוחלט לקובץ בתוך תיקיית public
                    const absoluteFolderToDelete = path.resolve(process.cwd(), 'public', normalizedRelative);

                    // הכלל המוזהב: אימות שהתיקייה למחיקה כלואה בתוך UPLOAD_ROOT
                    // אנחנו מוסיפים path.sep כדי למנוע מחיקה של תיקייה כמו "uploads_backup"
                    if (absoluteFolderToDelete.startsWith(UPLOAD_ROOT + path.sep)) {

                        // בדיקה נוספת: לא מוחקים את תיקיית השורש עצמה בטעות
                        if (absoluteFolderToDelete !== UPLOAD_ROOT) {
                            if (await fs.pathExists(absoluteFolderToDelete)) {
                                await fs.remove(absoluteFolderToDelete);
                                console.log(`Successfully deleted folder: ${absoluteFolderToDelete}`);
                            }
                        }
                    } else {
                        console.warn(`Blocked attempt to delete unauthorized path: ${absoluteFolderToDelete}`);
                    }
                } catch (e) {
                    console.error('Error during folder deletion safety check:', e);
                }
            }
        }

        return NextResponse.json({ success: true, bookId: newBook._id });

    } catch (error) {
        console.error('CRITICAL MERGE ERROR:', error);

        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
