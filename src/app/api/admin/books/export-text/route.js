import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import Page from '@/models/Page';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { hasBookLibraryAccess } from '@/lib/roles';

export async function GET(request) {
  const session = await getServerSession(authOptions);
  if (!hasBookLibraryAccess(session?.user?.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  try {
    await connectDB();

    const { searchParams } = new URL(request.url);
    const bookId = searchParams.get('bookId');

    if (!bookId) {
      return NextResponse.json(
        { success: false, error: 'חסר מזהה ספר (bookId)' },
        { status: 400 }
      );
    }

    const pages = await Page.find({ book: bookId })
      .sort({ pageNumber: 1 })
      .select('content pageNumber')
      .lean();

    if (!pages || pages.length === 0) {
      return NextResponse.json(
        { success: false, error: 'לא נמצאו עמודים לספר זה' },
        { status: 404 }
      );
    }

    const combinedText = pages
      .map((page) => page.content || '')
      .join('\n\n');

    return NextResponse.json({
      success: true,
      combinedText: combinedText,
    });

  } catch (error) {
    console.error('Error exporting book text:', error);
    return NextResponse.json(
      { success: false, error: 'שגיאת שרת פנימית: ' + error.message },
      { status: 500 }
    );
  }
}
