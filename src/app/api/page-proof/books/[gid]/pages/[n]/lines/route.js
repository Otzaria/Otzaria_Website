import connectDB from '@/lib/db';
import PageProofPage from '@/models/PageProofPage';
import { requireProofSession } from '@/lib/pageProof/pool';
import { storedRevision } from '@/lib/pageProof/importRules';
import { pageLinesOf, pageNoParam } from '@/lib/pageProof/linkFlow';
import { gidParam, json, noStore } from '@/lib/pageProof/respond';
import { badRequest, notFound, serverError } from '@/lib/apiResponse';

// GET: השורות של עמוד אחר באותו ספר — לקריאה בלבד, בשביל קישור שהצד השני שלו בעמוד אחר
// (פירוש שזולג אל אחרי הסעיף שלו). {success, page, revision, lines:[{id, line_no, order,
// stream, para_start, para_style, text, para_breaks?}]} מהעמוד כפי שיובא, בלי שורות שהוסרו.
// בלי שום תופעת-לוואי: לא תופס, לא מחכיר ולא מחדש החכרה — בניגוד ל-GET /api/page-proof
// ול-GET /api/page-proof/pages/[id]. רק קריאה אחת מהמסד.
const LINE_FIELDS = ['id', 'line_no', 'order', 'stream', 'status', 'para_start', 'para_style', 'para_breaks', 'text', 'text_ocr'];
const PROJECTION = { page: 1, revision: 1, ...Object.fromEntries(LINE_FIELDS.map((f) => [`doc.lines.${f}`, 1])) };

export async function GET(request, { params }) {
  const { error } = await requireProofSession();
  if (error) return noStore(error);
  try {
    const p = await params;
    const gid = gidParam(p.gid);
    if (!gid) return noStore(badRequest('מזהה ספר לא תקין'));
    const n = pageNoParam(p.n);
    if (n == null) return noStore(badRequest('מספר עמוד לא תקין'));
    await connectDB();
    const page = await PageProofPage.findOne({ gid, page: n }, PROJECTION).lean();
    if (!page) return noStore(notFound(`עמוד ${n} לא נמצא בספר`));
    return json({ success: true, page: page.page, revision: storedRevision(page), lines: pageLinesOf(page.doc) });
  } catch (e) {
    console.error('page-proof page lines GET', e);
    return noStore(serverError());
  }
}
