import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import Page from '@/models/Page';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { hasBookLibraryAccess } from '@/lib/roles';
import { badRequest, notFound, requireAccess, serverError } from '@/lib/apiResponse';

export async function GET(request) {
  const session = await getServerSession(authOptions);
  const denied = requireAccess(session, hasBookLibraryAccess);
  if (denied) return denied;
  try {
    await connectDB();

    const { searchParams } = new URL(request.url);
    const bookId = searchParams.get('bookId');

    if (!bookId) {
      return badRequest('חסר מזהה ספר (bookId)');
    }

    const pages = await Page.find({ book: bookId })
      .sort({ pageNumber: 1 })
      .select('content pageNumber')
      .lean();

    if (!pages || pages.length === 0) {
      return notFound('לא נמצאו עמודים לספר זה');
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
    return serverError('שגיאת שרת פנימית: ' + error.message);
  }
}
