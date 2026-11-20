import mongoose from 'mongoose';
import Book from '@/models/Book';
import { canRunPrivateOcr } from '@/lib/privateBooks';
import { hasPrivateOcrAccess } from '@/lib/roles';
import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import Page from '@/models/Page';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { hasBookLibraryAccess } from '@/lib/roles';
import { badRequest, notFound, requireAccess, serverError } from '@/lib/apiResponse';

export function createExportTextHandler(privateOnly = false) {
  return async function GET(request) {
    const session = await getServerSession(authOptions);
    const denied = requireAccess(session, privateOnly ? hasPrivateOcrAccess : hasBookLibraryAccess);
    if (denied) return denied;
    try {
      await connectDB();

      const { searchParams } = new URL(request.url);
      const bookId = searchParams.get('bookId');

      if (!bookId) {
        return badRequest('חסר מזהה ספר (bookId)');
      }

      if (privateOnly && !mongoose.isValidObjectId(bookId)) return badRequest('מזהה ספר לא תקין');
      if (privateOnly && !canRunPrivateOcr(await Book.findById(bookId), session.user)) return notFound('הספר לא נמצא');

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
      }, { headers: { 'Cache-Control': 'private, no-store' } });

    } catch (error) {
      console.error('Error exporting book text:', error);
      return serverError(privateOnly ? 'שגיאה בייצוא הטקסט' : 'שגיאת שרת פנימית: ' + error.message);
    }
  }

}
