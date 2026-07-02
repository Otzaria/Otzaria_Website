import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { ocrwinRecognize, getOcrEndpoints } from '@/lib/ocr/ocrwin';

const MAX_FILE_SIZE_MB = 20;
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/tiff', 'image/bmp', 'application/pdf'];

export async function POST(request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    let incomingData;
    try {
      incomingData = await request.formData();
    } catch {
      return NextResponse.json({ error: 'Failed to parse request form data' }, { status: 400 });
    }

    const file = incomingData.get('file');
    if (!file) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
    }

    // בדיקת סוג קובץ
    if (file.type && !ALLOWED_MIME_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: `Unsupported file type: ${file.type}. Allowed: ${ALLOWED_MIME_TYPES.join(', ')}` },
        { status: 415 }
      );
    }

    // בדיקת גודל קובץ
    if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
      return NextResponse.json(
        { error: `File too large: ${(file.size / 1024 / 1024).toFixed(1)}MB. Maximum allowed: ${MAX_FILE_SIZE_MB}MB` },
        { status: 413 }
      );
    }

    if (getOcrEndpoints().length === 0) {
      return NextResponse.json(
        { error: 'No OCR endpoints configured (missing OCRWIN_URL env var)' },
        { status: 500 }
      );
    }

    try {
      const text = await ocrwinRecognize(file, 'image.jpg');
      return NextResponse.json({ success: true, text });
    } catch (err) {
      console.error('OCRWIN: all endpoints exhausted:', err.message);
      return NextResponse.json({ error: err.message }, { status: 502 });
    }

  } catch (error) {
    console.error('OCRWIN Proxy Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
