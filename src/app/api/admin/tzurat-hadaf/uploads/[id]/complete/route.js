import { after } from 'next/server';
import { adminGate } from '@/lib/tzuratHadaf/session';
import { completeUpload } from '@/lib/tzuratHadaf/uploads';
import { processUpload } from '@/lib/tzuratHadaf/importPackage';
import { uploadShape } from '@/lib/tzuratHadaf/shapes';
import { json, fromResult, serverError } from '@/lib/tzuratHadaf/respond';

// POST — כל החלקים התקבלו ← 202 {upload} (queued). ההרכבה והייבוא — ברקע (after); הלקוח מתשאל את GET uploads/[id].
// עבודה שנקטעה (pm2 reload) — POST …/retry.
export const maxDuration = 300;

export async function POST(request, { params }) {
  const { denied } = await adminGate(request, 'import');
  if (denied) return denied;
  try {
    const { id } = await params;
    const r = await completeUpload(id);
    if (!r.ok) return fromResult(r);
    after(() => processUpload(id).catch((e) => console.error('tzurat import (after)', e)));
    return json({ upload: uploadShape(r.upload) }, 202);
  } catch (e) {
    console.error('tzurat upload complete', e);
    return serverError();
  }
}
