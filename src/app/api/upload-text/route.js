import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import Upload from '@/models/Upload';
import Book from '@/models/Book';
import Page from '@/models/Page';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { sendUploadNotification } from '@/lib/emailService';

export async function POST(request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const formData = await request.formData();
        const file = formData.get('file');
        const bookName = formData.get('bookName');

        if (!file || !bookName) return NextResponse.json({ error: 'Missing data' }, { status: 400 });

        const content = await file.text();
        await connectDB();

        const upload = await Upload.findOneAndUpdate(
            { bookName: bookName }, 
            { 
                uploader: session.user._id, 
                originalFileName: file.name,
                content: content,
                uploadType: 'single_page',
                status: 'pending',
                createdAt: new Date() 
            },
            { 
                upsert: true, 
                new: true, 
                setDefaultsOnInsert: true 
            }
        );

        // בדיקה אם זה העמוד האחרון בספר
        let isLastPage = false;
        try {
            // ניסיון לחלץ את שם הספר ומספר העמוד מה-bookName
            // פורמט אפשרי: "שם_ספר - עמוד X" או "שם_ספר/עמוד X"
            const pageMatch = bookName.match(/(.+?)[\s\-\/]+(?:עמוד|page)\s*(\d+)/i);
            
            if (pageMatch) {
                const extractedBookName = pageMatch[1].trim();
                const pageNumber = parseInt(pageMatch[2]);
                
                // חיפוש הספר לפי שם (slug או name)
                const book = await Book.findOne({
                    $or: [
                        { slug: extractedBookName },
                        { name: { $regex: new RegExp(extractedBookName, 'i') } }
                    ]
                });
                
                if (book && book.totalPages > 0) {
                    // ספירת עמודים שהושלמו (כולל זה שהועלה עכשיו)
                    const completedCount = await Page.countDocuments({
                        book: book._id,
                        status: 'completed'
                    });
                    
                    // בדיקה אם זה העמוד האחרון
                    isLastPage = (completedCount + 1) >= book.totalPages;
                }
            }
        } catch (error) {
            console.error('Error checking if last page:', error);
        }

        // שליחת התראה למנהלים רק אם זה העמוד האחרון
        if (isLastPage) {
            const notificationResult = await sendUploadNotification({
                bookName: bookName,
                uploadedBy: session.user.name || session.user.email,
                uploaderEmail: session.user.email,
                uploadType: 'single_page',
                originalFileName: file.name
            });
            
            return NextResponse.json({ 
                success: true, 
                message: 'התוכן עודכן בהצלחה - זה העמוד האחרון בספר!',
                uploadId: upload._id,
                isLastPage: true,
                emailNotification: notificationResult
            });
        }

        return NextResponse.json({ 
            success: true, 
            message: 'התוכן עודכן בהצלחה',
            uploadId: upload._id,
            isLastPage: false
        });

    } catch (error) {
        console.error('Upload Error:', error);
        return NextResponse.json({ success: false, error: 'שגיאה בעיבוד הקובץ' }, { status: 500 });
    }
}
