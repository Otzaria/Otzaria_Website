import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import Upload from '@/models/Upload';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { sendUploadNotification } from '@/lib/emailService';
import { isLastPageUpload } from '@/lib/uploadHelpers';

// טיפול בהעלאת קובץ טקסט ע"י משתמש
export async function POST(request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const formData = await request.formData();
        const file = formData.get('file');
        const bookName = formData.get('bookName');
        const confirmOverwrite = formData.get('confirmOverwrite') === 'true';

        const MAX_SIZE = 10 * 1024 * 1024;
        if (file.size > MAX_SIZE) {
            return NextResponse.json({ error: 'הקובץ גדול מדי (מקסימום 10MB)' }, { status: 400 });
        }

        const arrayBuffer = await file.arrayBuffer();
        const content = Buffer.from(arrayBuffer);
        await connectDB();

        const uploadType = formData.get('uploadType') || 'single_page';

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
                message: 'כבר העלת קובץ עם שם זה. האם להעלות גירסה חדשה? הגירסה הישנה תועבר לאשפה.',
                existingUpload: {
                    id: existingUpload._id,
                    uploadedAt: existingUpload.createdAt,
                    status: existingUpload.status
                }
            }, { status: 409 });
        }

        // אם קיים קובץ ואושר לדרוס - העבר את הישן לאשפה
        if (existingUpload && confirmOverwrite) {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            existingUpload.bookName = `${existingUpload.bookName} (גרסה ישנה מ-${timestamp}`;
            existingUpload.isDeleted = true;
            existingUpload.deletedAt = new Date();
            await existingUpload.save();
        }

        // יצירת העלאה חדשה
        const upload = await Upload.create({
            uploader: session.user._id,
            originalFileName: file.name,
            content: content,
            fileSize: file.size,
            lineCount: 0,
            uploadType: uploadType,
            status: 'pending',
            bookName: bookName
        });

        // בדיקה אם צריך לשלוח מייל
        let shouldSendEmail = false;
        
        if (uploadType === 'dicta' || uploadType === 'full_book') {
            // דיקטה וספר שלם - תמיד שולחים מייל
            shouldSendEmail = true;
        } else if (uploadType === 'single_page') {
            // עמוד בודד - רק אם זה העמוד האחרון
            shouldSendEmail = await isLastPageUpload(bookName);
        }

        // שליחת התראה למנהלים רק אם צריך
        let notificationResult = null;
        if (shouldSendEmail) {
            notificationResult = await sendUploadNotification({
                bookName: bookName,
                uploadedBy: session.user.name || session.user.email,
                uploaderEmail: session.user.email,
                uploadType: uploadType,
                originalFileName: file.name
            });
        }

        return NextResponse.json({ 
            success: true, 
            id: upload._id,
            emailNotification: notificationResult 
        });

    } catch (error) {
        return NextResponse.json({ success: false, error: 'שגיאה בעיבוד' }, { status: 500 });
    }
}

// קבלת ההיסטוריה של המשתמש (ללא שינוי, נשאר לצורך שלמות הקובץ)
export async function GET(request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session) return NextResponse.json({ success: true, uploads: [] }); 

        const { searchParams } = new URL(request.url);
        const userId = searchParams.get('userId'); 

        if (userId && userId !== session.user._id && session.user.role !== 'admin') {
             return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        await connectDB();
        
        const uploads = await Upload.find({ uploader: session.user._id })
            .sort({ createdAt: -1 })
            .limit(20)
            .lean();

        return NextResponse.json({ 
            success: true, 
            uploads: uploads.map(u => ({
                id: u._id,
                bookName: u.bookName,
                uploadedAt: u.createdAt,
                uploadType: u.uploadType || 'single_page',
                status: u.status,
                originalFileName: u.originalFileName
            }))
        });

    } catch (error) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
