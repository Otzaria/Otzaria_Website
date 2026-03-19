import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import Upload from '@/models/Upload';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { sendUploadNotification } from '@/lib/emailService';
import { isLastPageUpload } from '@/lib/uploadHelpers';

// פונקציה ליצירת כותרת מטא-דטה
function createMetadataHeader(metadata) {
    const lines = [
        '═══════════════════════════════════════════════════════════',
        'מידע על הספר',
        '═══════════════════════════════════════════════════════════',
        `שם הספר: ${metadata.bookName}`,
        `שם המחבר: ${metadata.authorName}`,
        `קטגוריית הספר: ${metadata.bookCategory}`,
        `קטגוריית המחבר: ${metadata.authorCategory}`,
        `שנת המחבר: ${metadata.authorYear}`,
        ...(metadata.publicationYear ? [`שנת הדפסה: ${metadata.publicationYear}`] : []),
        `בעל הזכויות: ${metadata.copyrightHolder}`,
        ...(metadata.sourceUrl ? [`מקור: ${metadata.sourceUrl}`] : []),
        `OCR: ${metadata.isOcr ? `כן - ${metadata.ocrDescription}` : 'לא'}`,
        '═══════════════════════════════════════════════════════════',
        '',
        '',
    ];
    return lines.join('\n');
}

// פונקציית עזר לחילוץ סיומת קובץ
function getFileExtension(fileName) {
    if (!fileName) return '';
    const lastDotIndex = fileName.lastIndexOf('.');
    if (lastDotIndex === -1) return '';
    return fileName.substring(lastDotIndex).toLowerCase();
}

// בדיקה אם הקובץ הוא טקסט או בינארי
function isTextFile(fileName) {
    const textExtensions = ['.txt', '.text', '.rtf'];
    return textExtensions.includes(getFileExtension(fileName));
}

// בדיקה אם הקובץ הוא וורד
function isWordFile(fileName) {
    const wordExtensions = ['.doc', '.docx'];
    return wordExtensions.includes(getFileExtension(fileName));
}

// טיפול בהעלאת קובץ טקסט ע"י משתמש
export async function POST(request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const formData = await request.formData();
        const file = formData.get('file');
        const bookName = formData.get('bookName');
        const confirmOverwrite = formData.get('confirmOverwrite') === 'true';
        
        // Extract metadata fields
        const authorName = formData.get('authorName');
        const bookCategory = formData.get('bookCategory');
        const authorCategory = formData.get('authorCategory');
        const authorYear = formData.get('authorYear');
        const publicationYear = formData.get('publicationYear');
        const copyrightHolder = formData.get('copyrightHolder');
        const sourceUrl = formData.get('sourceUrl');
        const isOcr = formData.get('isOcr') === 'true';
        const ocrDescription = formData.get('ocrDescription');

        const MAX_SIZE = 10 * 1024 * 1024;
        if (file.size > MAX_SIZE) {
            return NextResponse.json({ error: 'הקובץ גדול מדי (מקסימום 10MB)' }, { status: 400 });
        }

        let arrayBuffer = await file.arrayBuffer();
        let content = Buffer.from(arrayBuffer);
        
        // הוסף מטא-דטה לתחילת הקובץ רק להעלאות מסוג full_book
        const uploadType = formData.get('uploadType') || 'single_page';
        
        if (uploadType === 'full_book') {
            const metadata = {
                bookName,
                authorName,
                bookCategory,
                authorCategory,
                authorYear,
                publicationYear,
                copyrightHolder,
                sourceUrl,
                isOcr,
                ocrDescription
            };
            
            if (isTextFile(file.name)) {
                const metadataHeader = createMetadataHeader(metadata);
                const headerBuffer = Buffer.from(metadataHeader, 'utf8');
                content = Buffer.concat([headerBuffer, content]);
            } else if (isWordFile(file.name)) {
                // לקבצי וורד, נשמור את המטא-דטה בשדה נפרד בדטה בייס
                // ונוסיף אותה כשמוציאים את הקובץ
            }
        }
        
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
        const uploadData = {
            uploader: session.user._id,
            originalFileName: file.name,
            content: content,
            fileSize: content.length,
            lineCount: 0,
            uploadType: uploadType,
            status: 'pending',
            bookName: bookName
        };

        // הוסף מטא-דטה רק להעלאות מסוג full_book
        if (uploadType === 'full_book') {
            uploadData.authorName = authorName;
            uploadData.bookCategory = bookCategory;
            uploadData.authorCategory = authorCategory;
            uploadData.authorYear = authorYear;
            uploadData.publicationYear = publicationYear;
            uploadData.copyrightHolder = copyrightHolder;
            uploadData.sourceUrl = sourceUrl;
            uploadData.isOcr = isOcr;
            uploadData.ocrDescription = ocrDescription;
        }

        const upload = await Upload.create(uploadData);

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
