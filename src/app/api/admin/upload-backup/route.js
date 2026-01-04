import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';

// מבטל את מגבלת הגודל המובנית של Next.js לנתיב הזה ספציפית
export const config = {
  api: {
    bodyParser: false,
  },
};

export async function POST(request) {
  try {
    // 1. קבלת שם הקובץ מה-Query String
    const { searchParams } = new URL(request.url);
    const fileName = searchParams.get('filename');

    if (!fileName) {
      return NextResponse.json({ error: 'Filename is required' }, { status: 400 });
    }

    // 2. הגדרת נתיב יעד
    const filePath = path.join(process.cwd(), fileName);
    
    // 3. יצירת Write Stream לקובץ
    const fileStream = fs.createWriteStream(filePath);

    // 4. המרת ה-Web Stream (של הדפדפן) ל-Node Stream והזרמה לדיסק
    // request.body הוא ReadableStream ב-App Router
    if (!request.body) {
        return NextResponse.json({ error: 'No body' }, { status: 400 });
    }

    // @ts-ignore
    const nodeStream = Readable.fromWeb(request.body);
    await pipeline(nodeStream, fileStream);

    console.log(`✅ File saved: ${filePath}`);
    return NextResponse.json({ success: true, path: filePath });

  } catch (error) {
    console.error('Upload error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}