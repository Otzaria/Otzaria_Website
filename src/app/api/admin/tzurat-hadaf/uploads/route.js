import { after } from 'next/server';
import TzuratUpload from '@/models/TzuratUpload';
import { adminGate } from '@/lib/tzuratHadaf/session';
import { createUpload, cleanupOldUploads } from '@/lib/tzuratHadaf/uploads';
import { uploadShape } from '@/lib/tzuratHadaf/shapes';
import { json, badRequest, fromResult, serverError, readJsonBody, tooBigResponse } from '@/lib/tzuratHadaf/respond';

// העלאת חבילה בחלקים (docs/tzurat-hadaf/OPERATIONS.md):
// GET  ← {uploads:[Upload]} (האחרונות)
// POST {name, size} ← 201 {id, chunkSize, chunks}. אחר כך PUT uploads/[id]/chunks/[n] לכל חלק, ו-POST …/complete.
// כל יצירה מריצה ברקע גם את הניקוי של העלאות בנות יותר משבוע.
export const dynamic = 'force-dynamic';

export async function GET(request) {
  const { denied } = await adminGate(request, 'read');
  if (denied) return denied;
  try {
    const rows = await TzuratUpload.find({}).sort({ createdAt: -1 }).limit(30).lean();
    return json({ uploads: rows.map(uploadShape) });
  } catch (e) {
    console.error('tzurat uploads GET', e);
    return serverError();
  }
}

export async function POST(request) {
  const { admin, denied } = await adminGate(request, 'import');
  if (denied) return denied;
  try {
    const { body, tooBig } = await readJsonBody(request, 4096);
    if (tooBig) return tooBigResponse();
    if (!body || typeof body !== 'object') return badRequest('גוף הבקשה חסר');
    const r = await createUpload(body, admin);
    if (!r.ok) return fromResult(r);
    after(() => cleanupOldUploads().catch((e) => console.error('tzurat uploads cleanup', e?.name)));
    return json({ id: String(r.upload._id), chunkSize: r.upload.chunkSize, chunks: r.upload.chunks }, 201);
  } catch (e) {
    console.error('tzurat uploads POST', e);
    return serverError();
  }
}
