import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import Upload from '@/models/Upload';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { sendUploadNotification } from '@/lib/emailService';
import { isLastPageUpload } from '@/lib/uploadHelpers';

export async function POST(request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const formData = await request.formData();
        const file = formData.get('file');
        const bookName = formData.get('bookName');
        const confirmOverwrite = formData.get('confirmOverwrite') === 'true';

        if (!file || !bookName) return NextResponse.json({ error: 'Missing data' }, { status: 400 });

        const content = await file.text();
        await connectDB();

        // בדיקה אם קיים קובץ עם אותו שם
        const existingUpload = await Upload.findOne({ 
            uploader: session.user._id,
            bookName: bookName, 
            isDeleted: false 
        });

        // אם קיים קובץ ולא אושר לדרוס
        if (existingUpload && !confirmOverwrite) {
            return NextResponse.json({ 
                requiresConfirmation: true,
                message: 'קובץ עם שם זה כבר קיים במערכת. האם להעלות גירסה חדשה?',
                existingUpload: {
                    id: existingUpload._id,
                    uploadedAt: existingUpload.createdAt,
                    status: existingUpload.status
                }
            }, { status: 409 });
        }

        // אם קיים קובץ ואושר לדרוס - העבר את הישן לאשפה
        if (existingUpload && confirmOverwrite) {
            existingUpload.bookName = `${existingUpload.bookName} (הועלתה גירסה חדשה)`;
            existingUpload.isDeleted = true;
            existingUpload.deletedAt = new Date();
            await existingUpload.save();
        }

        // יצירת העלאה חדשה
        const upload = await Upload.create({
            uploader: session.user._id, 
            originalFileName: file.name,
            content: content,
            uploadType: 'single_page',
            status: 'pending',
            bookName: bookName
        });

        // בדיקה אם זה העמוד האחרון בספר
        const isLastPage = await isLastPageUpload(bookName);

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
