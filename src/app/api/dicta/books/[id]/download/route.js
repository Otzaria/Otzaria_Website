import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import connectDB from '@/lib/db';
import DictaBook from '@/models/DictaBook';
import UploadEditCopy from '@/models/UploadEditCopy';

function getDownloadBaseName(title = 'dicta-book') {
  const normalizedTitle = typeof title === 'string' ? title : 'dicta-book';
  const lastSegment = normalizedTitle.split('/').filter(Boolean).pop() || normalizedTitle;
  return lastSegment.trim() || 'dicta-book';
}

function buildSafeFilename(title = 'dicta-book') {
  const safeTitle = getDownloadBaseName(title)
    .replace(/[<>:"/\|?*\x00-\x1F]/g, '_')
    .replace(/\s+/g, ' ')
    .trim();

  return `${safeTitle || 'dicta-book'}_dicta.txt`;
}

function buildAsciiFilename(filename) {
  return filename
    .replace(/[^\x20-\x7E]/g, '_')
    .replace(/["\\]/g, '_')
    .replace(/\s+/g, ' ')
    .trim() || 'dicta-book.txt';
}

export async function GET(request, { params }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user._id || session.user.id;
    const isAdmin = session.user.role === 'admin';

    await connectDB();
    const { id } = await params;

    let book = await DictaBook.findById(id).populate('claimedBy', 'name');
    let isEditCopy = false;

    if (!book) {
      book = await UploadEditCopy.findById(id).populate('claimedBy', 'name');
      isEditCopy = true;
    }

    if (!book) {
      return NextResponse.json({ error: 'Book not found' }, { status: 404 });
    }

    if (isEditCopy && !isAdmin) {
      return NextResponse.json({ error: 'Forbidden: Admin access required for edit copies' }, { status: 403 });
    }

    if (book.status === 'in-progress') {
      const claimedById = book.claimedBy?._id?.toString?.() || book.claimedBy?.toString?.();
      const isOwner = claimedById === userId;
      if (!isAdmin && !isOwner) {
        return NextResponse.json({ error: 'Forbidden: This book is being edited by another user' }, { status: 403 });
      }
    }

    const content = book.content || '';
    const filename = buildSafeFilename(book.title);
    const asciiFilename = buildAsciiFilename(filename);

    return new NextResponse(content, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Content-Disposition': `attachment; filename="${asciiFilename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      },
    });
  } catch (error) {
    console.error('Failed to download dicta book:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

