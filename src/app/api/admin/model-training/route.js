import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import connectDB from '@/lib/db';
import OcrJob from '@/models/OcrJob';
import { hasOcrAccess } from '@/lib/roles';
import { requireAccess } from '@/lib/apiResponse';
import { readJsonBody, workerJson } from '@/lib/ocr/workerHttp';
import { readWorkerConfig } from '@/lib/ocr/workerAuth';
import { trainingRequest } from '@/lib/ocr/modelTraining.pure';
import { createTraining, trainingView } from '@/lib/ocr/modelTraining';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;
const json = (status, value) => workerJson(status, value);

export async function GET(request) {
  const denied = requireAccess(await getServerSession(authOptions), hasOcrAccess);
  if (denied) return denied;
  await connectDB();
  const book = new URL(request.url).searchParams.get('bookId');
  if (book && !/^[a-f0-9]{24}$/.test(book)) return json(400, { error: 'מזהה ספר לא תקין' });
  const jobs = await OcrJob.find({ taskType: 'training', ...(book ? { book } : {}) }).sort({ _id: -1 }).limit(20).lean();
  return json(200, { enabled: process.env.OCR_TRAINING_ENABLED === 'true', jobs: jobs.map(trainingView) });
}

export async function POST(request) {
  const session = await getServerSession(authOptions);
  const denied = requireAccess(session, hasOcrAccess);
  if (denied) return denied;
  if (process.env.OCR_TRAINING_ENABLED !== 'true') return json(503, { error: 'מסלול האימון עדיין לא הותקן במחשב המקומי' });
  const parsed = await readJsonBody(request, 4096);
  const req = parsed.ok && trainingRequest(parsed.body);
  if (!req) return json(parsed.status || 400, { error: 'יש לבחור ספר וחמישה עמודים שהוגהו, לאשר את הטקסט ולבחור כתב ו־1–20 סבבים' });
  const cfg = readWorkerConfig();
  if (!cfg.ok) return json(503, { error: 'המחשב המקומי אינו מוגדר' });
  try {
    await connectDB();
    const result = await createTraining(req, session, cfg.workerId);
    return json(result.status, result.body);
  } catch {
    return json(500, { error: 'הכנת חומר האימון נכשלה. בדקו שכל חמשת העמודים הושלמו ויש בהם טקסט מתוקן.' });
  }
}
