// Uploads/storage are supplied by the live installation, not bundled build assets.
import path from 'path';
import fs from 'fs';
import { Readable } from 'node:stream';
import { promises as fsp } from 'fs';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import connectDB from '@/lib/db';
import Book from '@/models/Book';
import { canReadBook } from '@/lib/privateBooks';

const UPLOAD_ROOT = process.env.UPLOAD_DIR
  ? path.resolve(process.env.UPLOAD_DIR)
  : path.resolve(/*turbopackIgnore: true*/ process.cwd(), 'public', 'uploads');

const MIME_MAP = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.pdf': 'application/pdf',
  '.txt': 'text/plain; charset=utf-8',
  '.json': 'application/json',
};

// תיקיות שאינן מוגשות כנכס סטטי: תמונות תיוג מבנה-עמוד שייכות לקורפוס
// ה-OCR (לא "ספרים" באתר) ומוגשות רק דרך /api/ocr-layout/[id]/image
// למשתמשים מאומתים. כך גם סריקות הגהת-העמודים (/api/page-proof/pages/[id]/image)
// ותמונות צורת הדף (/api/tzurat-hadaf/items/[id]/image, /api/tzurat-hadaf/pages/[id]/image).
const BLOCKED_PREFIXES = ['ocr-layout/', 'page-proof/', 'tzurat-hadaf/'];

export async function GET(request, { params }) {
  const segments = (await params).path;
  const relative = segments.join('/').replace(/\\/g, '/');

  const resolved = path.resolve(UPLOAD_ROOT, relative);
  if (!resolved.startsWith(UPLOAD_ROOT + path.sep) && resolved !== UPLOAD_ROOT) {
    return new Response(null, { status: 403 });
  }

  // החסימה נבדקת על הנתיב אחרי resolve (יחסית לשורש), לא על המחרוזת הגולמית: מקטע מקודד כמו
  // x%2F..%2Fpage-proof מגיע מפוענח ועוקף בדיקת קידומת לפני resolve. לוכסן-הפוך ורישיות אינם עוקפים
  // (מערכת קבצים לא רגישת-רישיות תגיש OCR-Layout/... כאילו הייתה ocr-layout/)
  const normalized = path.relative(UPLOAD_ROOT, resolved).replace(/\\/g, '/').toLowerCase();
  if (BLOCKED_PREFIXES.some((p) => normalized === p.slice(0, -1) || normalized.startsWith(p))) {
    return new Response(null, { status: 403 });
  }

  // העלאות אישיות ישנות משתמשות בקידומת הזו. ספרים ציבוריים רגילים אינם פונים למסד או לסשן.
  const [collection, slug, ...parts] = path.relative(UPLOAD_ROOT, resolved).replace(/\\/g, '/').split('/');
  let verifyAccess = false;
  const legacySlug = Boolean(slug && /^u-[a-f0-9]{4}/i.test(slug) && (slug.length === 6 || slug[6] === '-'));
  if (collection.toLowerCase() === 'books' && legacySlug && parts.length) {
    await connectDB();
    const book = await Book.findOne({ slug }).select('isHidden isPrivate ownerId').lean();
    if (!book) return new Response(null, { status: 404, headers: { 'Cache-Control': 'private, no-store' } });
    verifyAccess = Boolean(book.isHidden || book.isPrivate || book.ownerId);
    if (verifyAccess) {
      const session = await getServerSession(authOptions);
      if (!canReadBook(book, session?.user)) return new Response(null, { status: 404, headers: { 'Cache-Control': 'private, no-store' } });
    }
  }

  const cacheControl = verifyAccess ? 'private, no-store' : 'public, max-age=86400, stale-while-revalidate=604800, must-revalidate';
  let stat;
  try {
    stat = await fsp.stat(resolved);
  } catch (err) {
    if (err.code === 'ENOENT') return new Response(null, { status: 404 });
    throw err;
  }

  if (!stat.isFile()) return new Response(null, { status: 404 });

  const lastModified = stat.mtime.toUTCString();
  const etag = `"${stat.size}-${stat.mtimeMs}"`;

  const ifNoneMatch = request.headers.get('if-none-match');
  if (!verifyAccess && (ifNoneMatch ? ifNoneMatch === etag : request.headers.get('if-modified-since') === lastModified)) {
    return new Response(null, { status: 304, headers: { 'Cache-Control': cacheControl, 'Last-Modified': lastModified, 'ETag': etag } });
  }

  const ext = path.extname(resolved).toLowerCase();
  const contentType = MIME_MAP[ext] || 'application/octet-stream';

  const stream = Readable.toWeb(fs.createReadStream(resolved));

  return new Response(stream, {
    headers: {
      'Content-Type': contentType,
      'Content-Length': stat.size.toString(),
      'Cache-Control': cacheControl,
      'Last-Modified': lastModified,
      'ETag': etag,
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
