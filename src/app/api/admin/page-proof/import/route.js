import { NextResponse } from 'next/server';
import { unzipSync } from 'fflate';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import connectDB from '@/lib/db';
import { hasOcrAccess } from '@/lib/roles';
import { requireAccess, badRequest, serverError } from '@/lib/apiResponse';
import { parsePackageEntries } from '@/lib/pageProof/packageParse';
import { importPackages } from '@/lib/pageProof/importPackages';

// המרת תמונות גדולות (עד 6000×7500) לוקחת זמן
export const maxDuration = 300;

// unzipSync פורק לזיכרון — תקרה לכל קובץ. ספר גדול מעלים בכמה ZIP-ים:
// אותו gid מתמזג (ייבוא-חוזר מוסיף עמודים).
const MAX_ZIP_BYTES = 150 * 1024 * 1024;
const MAX_FILES = 5;

// POST multipart: file (אחד או יותר) — ZIP של תיקיית חבילה-עמודים אחת או
// יותר (חבילה.json + עמוד-NNN.json + pages/). doublePct — אחוז הרצפים
// הכפולים לספר חדש (ברירת מחדל 10).
export async function POST(request) {
  const session = await getServerSession(authOptions);
  const denied = requireAccess(session, hasOcrAccess);
  if (denied) return denied;

  try {
    const form = await request.formData();
    const files = form.getAll('file').filter((f) => f && typeof f.arrayBuffer === 'function');
    if (!files.length) return badRequest('לא נבחר קובץ');
    if (files.length > MAX_FILES) return badRequest(`עד ${MAX_FILES} קבצים בכל העלאה`);
    const pctRaw = Number(form.get('doublePct'));
    const doublePct = Number.isFinite(pctRaw) && pctRaw >= 0 && pctRaw <= 100 ? pctRaw : undefined;

    await connectDB();
    const results = [];
    const errors = [];
    for (const file of files) {
      if (!/\.zip$/i.test(file.name || '')) {
        errors.push(`${file.name}: יש להעלות קובץ ZIP`);
        continue;
      }
      if (file.size > MAX_ZIP_BYTES) {
        errors.push(`${file.name}: הקובץ גדול מ-150MB — פצלו את הספר לכמה קבצים`);
        continue;
      }
      let entries;
      try {
        entries = unzipSync(new Uint8Array(await file.arrayBuffer()));
      } catch {
        errors.push(`${file.name}: קובץ ה-ZIP פגום`);
        continue;
      }
      const parsed = parsePackageEntries(entries);
      errors.push(...parsed.errors.map((e) => `${file.name}: ${e}`));
      if (parsed.packages.length) {
        const r = await importPackages(parsed.packages, entries, { userId: session.user.id || session.user._id, doublePct });
        results.push(...r);
      }
    }
    return NextResponse.json({ success: results.length > 0, results, errors: errors.slice(0, 50) });
  } catch (e) {
    console.error('page-proof import', e);
    return serverError('הייבוא נכשל');
  }
}
