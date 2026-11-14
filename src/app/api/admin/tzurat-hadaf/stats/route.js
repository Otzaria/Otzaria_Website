import { adminGate } from '@/lib/tzuratHadaf/session';
import { adminStats } from '@/lib/tzuratHadaf/admin';
import { json, serverError } from '@/lib/tzuratHadaf/respond';

// GET — לוח הבקרה של צורת הדף ← {books, items:{byStatus, byKind}, submissions, reports, volunteers, uploads}
// מנהל המודול (session) או מפתח tht_ עם read.
export const dynamic = 'force-dynamic';

export async function GET(request) {
  const { denied } = await adminGate(request, 'read');
  if (denied) return denied;
  try {
    return json(await adminStats());
  } catch (e) {
    console.error('tzurat admin stats', e);
    return serverError();
  }
}
