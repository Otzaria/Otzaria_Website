import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import connectDB from '@/lib/db';
import PrivateBookSource from '@/models/PrivateBookSource';
import { isAdmin } from '@/lib/roles';
import {
  getMoreBooksList,
  loadOptionConfigs,
  pathToBookTitle,
  DEFAULT_STATUS_KEY,
} from '@/lib/private-sources';

/** בודק הרשאת מנהל כללי; מחזיר את הסשן או null */
async function requireAdmin() {
  const session = await getServerSession(authOptions);
  if (!isAdmin(session?.user?.role)) return null;
  return session;
}

const forbidden = () => NextResponse.json({ error: 'Forbidden' }, { status: 403 });

function cleanString(value, max = 2000) {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, max);
}

/**
 * GET — רשימת הספרים מגיטהאב ממוזגת עם הרשומות שב-DB, יחד עם רשימות
 * האופציות הדינמיות (כדי לחסוך סבב נוסף).
 * ?refresh=1 — רענון כפוי של מטמון הגיטהאב.
 */
export async function GET(request) {
  const session = await requireAdmin();
  if (!session) return forbidden();

  try {
    await connectDB();

    const forceRefresh = new URL(request.url).searchParams.get('refresh') === '1';
    // כשל בגיטהאב לא אמור להעלים את המטא-דאטה השמורה — לכן הוא נתפס בנפרד
    let githubError = false;
    const [books, records, options] = await Promise.all([
      getMoreBooksList({ forceRefresh }).catch((listError) => {
        console.error('Error loading MoreBooks list from GitHub:', listError);
        githubError = true;
        return [];
      }),
      PrivateBookSource.find({}).lean(),
      loadOptionConfigs(),
    ]);

    const byPath = new Map(records.map((r) => [r.bookPath, r]));

    const items = books.map((book) => {
      const record = byPath.get(book.bookPath) || null;
      return {
        ...book,
        record: record
          ? {
              ...record,
              _id: String(record._id),
              status: record.status || DEFAULT_STATUS_KEY,
            }
          : null,
      };
    });

    // רשומות שנשמרו לספרים שכבר אינם בגיטהאב — כדי שלא ייעלמו בשקט
    const knownPaths = new Set(books.map((b) => b.bookPath));
    const orphans = records
      .filter((r) => !knownPaths.has(r.bookPath))
      .map((r) => ({ bookPath: r.bookPath, bookTitle: r.bookTitle || pathToBookTitle(r.bookPath) }));

    return NextResponse.json({
      success: true,
      items,
      orphans,
      options,
      total: items.length,
      githubError,
      ...(githubError
        ? {
            githubErrorMessage:
              'לא ניתן לטעון את רשימת הספרים מגיטהאב כרגע — מוצגות רק רשומות שמורות',
          }
        : {}),
    });
  } catch (error) {
    console.error('Error loading private book sources:', error);
    return NextResponse.json(
      { error: 'שגיאה בטעינת מקורות הספרים הפרטיים' },
      { status: 500 }
    );
  }
}

/** POST — יצירה/עדכון (upsert) של רשומה לפי bookPath. */
export async function POST(request) {
  const session = await requireAdmin();
  if (!session) return forbidden();

  try {
    const body = await request.json();
    const bookPath = cleanString(body?.bookPath, 500);
    if (!bookPath) {
      return NextResponse.json({ error: 'חסר נתיב ספר (bookPath)' }, { status: 400 });
    }

    let permissionDate = null;
    if (body?.permissionDate) {
      const parsed = new Date(body.permissionDate);
      if (!Number.isNaN(parsed.getTime())) permissionDate = parsed;
    }

    const customFields = Array.isArray(body?.customFields)
      ? body.customFields
          .map((f) => ({ label: cleanString(f?.label, 200), value: cleanString(f?.value, 5000) }))
          .filter((f) => f.label || f.value)
          .slice(0, 50)
      : [];

    const allowedPlatforms = Array.isArray(body?.allowedPlatforms)
      ? [...new Set(body.allowedPlatforms.map((p) => cleanString(p, 100)).filter(Boolean))].slice(
          0,
          50
        )
      : [];

    const update = {
      bookPath,
      bookTitle: cleanString(body?.bookTitle, 500) || pathToBookTitle(bookPath),
      ownerName: cleanString(body?.ownerName, 300),
      ownerEmail: cleanString(body?.ownerEmail, 300),
      ownerPhone: cleanString(body?.ownerPhone, 100),
      obtainedBy: cleanString(body?.obtainedBy, 300),
      permissionMethod: cleanString(body?.permissionMethod, 100),
      permissionDate,
      requireCredit: Boolean(body?.requireCredit),
      allowedPlatforms,
      conditionsText: cleanString(body?.conditionsText, 20000),
      notes: cleanString(body?.notes, 20000),
      status: cleanString(body?.status, 100) || DEFAULT_STATUS_KEY,
      customFields,
      updatedBy: session.user?.email || session.user?.name || '',
    };

    await connectDB();

    const record = await PrivateBookSource.findOneAndUpdate(
      { bookPath },
      { $set: update },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).lean();

    return NextResponse.json({
      success: true,
      record: { ...record, _id: String(record._id) },
    });
  } catch (error) {
    console.error('Error saving private book source:', error);
    return NextResponse.json({ error: 'שגיאה בשמירת הרשומה' }, { status: 500 });
  }
}

/** DELETE ?path=... — מחיקת רשומה (הספר עצמו בגיטהאב אינו מושפע). */
export async function DELETE(request) {
  const session = await requireAdmin();
  if (!session) return forbidden();

  try {
    const bookPath = new URL(request.url).searchParams.get('path');
    if (!bookPath) {
      return NextResponse.json({ error: 'חסר נתיב ספר' }, { status: 400 });
    }

    await connectDB();
    const result = await PrivateBookSource.deleteOne({ bookPath });

    if (result.deletedCount === 0) {
      return NextResponse.json({ error: 'לא נמצאה רשומה למחיקה' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting private book source:', error);
    return NextResponse.json({ error: 'שגיאה במחיקת הרשומה' }, { status: 500 });
  }
}
