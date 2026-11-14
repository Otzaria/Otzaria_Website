import fs from 'fs-extra';
import PageProofBook from '@/models/PageProofBook';
import PageProofPage from '@/models/PageProofPage';
import PageProofSubmission from '@/models/PageProofSubmission';
import PageProofDraft from '@/models/PageProofDraft';
import { resolveImageFsPath } from '@/lib/ocr/images';
import { adminGate, ok, fail, jsonBody, crash } from '../_lib/http';

// הדף הישן (docs/75 ה-15; docs/76 §8.2): כלי מחיקה **חד-פעמי** לנתונים של page-proof
// הקודם — הספרים, העמודים, ההגשות, הטיוטות ותמונות-העמודים (/uploads/page-proof/).
// רק בלחיצה של המנהל, אחרי שני אישורים בדף; השרת דורש גם את משפט-האישור. לעולם לא
// אוטומטי. לא נמחקים: הקוד הישן (החלטה נפרדת — §9), מפתחות-הגישה של תוכנת-הספר,
// הגדרות, ותמונות-ספרים של האתר שעמודים "במצב-קישור" הצביעו עליהן (/uploads/books/…).
//
// GET  ← {counts:{books, pages, submissions, drafts}, files} — מה יימחק
// POST {confirm: CONFIRM} ← {deleted:{books, pages, submissions, drafts}, files}

const CONFIRM = 'מחק את הדף הישן';

async function countFiles(dir) {
  let n = 0;
  const walk = async (d) => {
    const names = await fs.readdir(d, { withFileTypes: true }).catch(() => []);
    for (const e of names) {
      if (e.isDirectory()) await walk(`${d}/${e.name}`);
      else n++;
    }
  };
  await walk(dir);
  return n;
}

// התיקייה של הדף הישן (lib/pageProof/importPackages.js IMAGE_ROOT) — רק היא
const IMAGE_ROOT = '/uploads/page-proof';
const dirOf = () => resolveImageFsPath(IMAGE_ROOT);

async function counts() {
  const [books, pages, submissions, drafts, files] = await Promise.all([
    PageProofBook.countDocuments({}),
    PageProofPage.countDocuments({}),
    PageProofSubmission.countDocuments({}),
    PageProofDraft.countDocuments({}),
    countFiles(dirOf()),
  ]);
  return { counts: { books, pages, submissions, drafts }, files };
}

export async function GET() {
  const { error } = await adminGate();
  if (error) return error;
  try {
    return ok({ ...(await counts()), confirm: CONFIRM });
  } catch (e) {
    return crash('legacy', e);
  }
}

export async function POST(request) {
  const { error } = await adminGate();
  if (error) return error;
  const { body, error: bad } = await jsonBody(request);
  if (bad) return bad;
  if (body.confirm !== CONFIRM) return fail(400, 'חסר משפט-האישור — שום דבר לא נמחק');
  try {
    const before = await counts();
    const [s, d, p, b] = await Promise.all([
      PageProofSubmission.deleteMany({}),
      PageProofDraft.deleteMany({}),
      PageProofPage.deleteMany({}),
      PageProofBook.deleteMany({}),
    ]);
    await fs.remove(dirOf());
    return ok({
      deleted: { books: b.deletedCount, pages: p.deletedCount, submissions: s.deletedCount, drafts: d.deletedCount },
      files: before.files,
    });
  } catch (e) {
    return crash('legacy delete', e, 'המחיקה נכשלה באמצע — אפשר להריץ שוב');
  }
}
