import { adminGate } from '@/lib/tzuratHadaf/session';
import { getUpload } from '@/lib/tzuratHadaf/uploads';
import { uploadShape } from '@/lib/tzuratHadaf/shapes';
import { json, notFound, serverError } from '@/lib/tzuratHadaf/respond';

// GET — מצב ההעלאה (החלקים שהתקבלו — להמשך העלאה שנקטעה) ומצב עבודת הייבוא ← {upload}
export const dynamic = 'force-dynamic';

export async function GET(request, { params }) {
  const { denied } = await adminGate(request, 'read');
  if (denied) return denied;
  try {
    const { id } = await params;
    const up = await getUpload(id);
    if (!up) return notFound('ההעלאה לא נמצאה');
    return json({ upload: uploadShape(up) });
  } catch (e) {
    console.error('tzurat upload GET', e);
    return serverError();
  }
}
