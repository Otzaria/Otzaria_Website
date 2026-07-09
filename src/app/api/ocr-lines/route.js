import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import { LINES_BATCH_SIZE, sampleAvailableLines, requireVerifiedSession } from '@/lib/ocr/linePool';

// GET: מנה של עד 10 שורות זמינות, אקראיות ומוחכרות זמנית למבקש — כדי שמשתמשים
// שונים לא יעבדו על אותן שורות בו-זמנית. רענון מחזיר מנה אקראית חדשה.
export async function GET() {
  const { session, error } = await requireVerifiedSession();
  if (error) return error;

  try {
    await connectDB();
    const lines = await sampleAvailableLines(LINES_BATCH_SIZE);
    return NextResponse.json({ success: true, lines });
  } catch (err) {
    console.error('OCR lines batch error:', err, 'user:', session?.user?.id);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
