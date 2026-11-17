// GET /api/admin/model-training/{id}/download — הורדת חמשת העמודים המוגהים של עבודת אימון למחשב המנהל:
// הארכיון הקפוא (תמונות + הטקסט המתוקן, כמות שנשלחו לשירות) + ה-layout השמור של כל עמוד + download.json.
// אותה הרשאה כמו לשונית האימון (hasOcrAccess); תשובה פרטית בלבד. לא תלוי במתג OCR_TRAINING_ENABLED:
// הוא מוריד רק ארכיון שכבר הוכן, ואינו יוצר עבודה או שולח דבר לשירות.
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import connectDB from '@/lib/db';
import { hasOcrAccess } from '@/lib/roles';
import { requireAccess } from '@/lib/apiResponse';
import { workerJson } from '@/lib/ocr/workerHttp';
import { buildTrainingDownload } from '@/lib/ocr/modelTrainingDownload';
import { downloadFileName } from '@/lib/ocr/modelTrainingDownload.pure';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET(_request, { params }) {
  const denied = requireAccess(await getServerSession(authOptions), hasOcrAccess);
  if (denied) return denied;
  const { id } = await params;
  if (!/^[a-f0-9]{24}$/.test(String(id))) return workerJson(400, { error: 'מזהה עבודה לא תקין' });
  try {
    await connectDB();
    const result = await buildTrainingDownload(id);
    if (!result.ok) return workerJson(result.status, { error: result.error });
    return new Response(result.stream, { status: 200, headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${downloadFileName(result.jobId)}"`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    } });
  } catch {
    return workerJson(500, { error: 'הכנת קובץ ההורדה נכשלה' });
  }
}
