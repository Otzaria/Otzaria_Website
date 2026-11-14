import { adminGate } from '@/lib/tzuratHadaf/session';
import { writeChunk } from '@/lib/tzuratHadaf/uploads';
import { json, fromResult, serverError } from '@/lib/tzuratHadaf/respond';

// PUT (application/octet-stream) — חלק n של ההעלאה, בגודל המדויק (8MB; האחרון קצר יותר). נכתב בזרימה לדיסק;
// שליחה חוזרת של אותו חלק דורסת אותו (idempotent) ← {received:[…]}
export const maxDuration = 300;

export async function PUT(request, { params }) {
  const { denied } = await adminGate(request, 'import');
  if (denied) return denied;
  try {
    const { id, n } = await params;
    const len = request.headers.get('content-length');
    const r = await writeChunk(id, n, request.body, { contentLength: len == null ? null : Number(len) });
    if (!r.ok) return fromResult(r);
    return json({ received: r.received });
  } catch (e) {
    console.error('tzurat chunk PUT', e?.code || e?.name);
    return serverError();
  }
}
