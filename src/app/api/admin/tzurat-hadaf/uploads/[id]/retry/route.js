import { after } from 'next/server';
import { adminGate } from '@/lib/tzuratHadaf/session';
import { requeueUpload } from '@/lib/tzuratHadaf/uploads';
import { processUpload } from '@/lib/tzuratHadaf/importPackage';
import { uploadShape } from '@/lib/tzuratHadaf/shapes';
import { json, fromResult, serverError } from '@/lib/tzuratHadaf/respond';

// POST — הרצה חוזרת של הייבוא מ-package.zip (נכשל, הסתיים, או נתקע בלי דופק 3 דקות) ← 202 {upload}. idempotent.
export const maxDuration = 300;

export async function POST(request, { params }) {
  const { denied } = await adminGate(request, 'import');
  if (denied) return denied;
  try {
    const { id } = await params;
    const r = await requeueUpload(id);
    if (!r.ok) return fromResult(r);
    after(() => processUpload(id).catch((e) => console.error('tzurat import retry (after)', e)));
    return json({ upload: uploadShape(r.upload) }, 202);
  } catch (e) {
    console.error('tzurat upload retry', e);
    return serverError();
  }
}
