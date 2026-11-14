import { adminGate } from '@/lib/tzuratHadaf/session';
import { exportRowsStream } from '@/lib/tzuratHadaf/exportStream';
import { parseTypes, parseSince } from '@/lib/tzuratHadaf/exportRows';
import { badRequest, json, readJsonBody, tooBigResponse } from '@/lib/tzuratHadaf/respond';
import { acknowledgeExport } from '@/lib/tzuratHadaf/exportAck';
import TzuratExportJob from '@/models/TzuratExportJob';

// GET ?since=<iso>&types=decision,anchor,check,report,contributor (גם parts=, גם ברבים) — NDJSON זורם (PACKAGE.md §3).
// שורה לרשומה, עם type; הראשונה — meta. private, no-store; attachment.
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET(request) {
  const { denied } = await adminGate(request, 'read');
  if (denied) return denied;
  const sp = new URL(request.url).searchParams;
  const t = parseTypes(sp.get('types') ?? sp.get('parts'));
  if (t.error) return badRequest(t.error);
  const s = parseSince(sp.get('since'));
  if (s.error) return badRequest(s.error);
  const encoder = new TextEncoder();
  const needsAck = t.types.includes('anchor') || t.types.includes('check');
  const job = needsAck ? await TzuratExportJob.create({ expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) }) : null;
  const pending = [];
  const flush = async () => {
    if (!job || !pending.length) return;
    const ids = pending.splice(0);
    await TzuratExportJob.updateOne({ _id: job._id, status: 'building' }, { $addToSet: { submissions: { $each: ids } } });
  };
  const rows = exportRowsStream({
    types: t.types,
    since: s.since,
    markExported: false,
    exportId: job?._id,
    onSubmission: job ? async (id) => {
      pending.push(id);
      if (pending.length >= 500) await flush();
    } : null,
  });
  const stream = new ReadableStream({
    async pull(controller) {
      try {
        const { value, done } = await rows.next();
        if (done) {
          await flush();
          if (job) await TzuratExportJob.updateOne(
            { _id: job._id, status: 'building' },
            { $set: { status: 'ready', readyAt: new Date() } }
          );
          controller.close();
          return;
        }
        controller.enqueue(encoder.encode(`${JSON.stringify(value)}\n`));
      } catch (e) {
        console.error('tzurat export', e);
        await rows.return?.().catch(() => {});
        controller.error(e);
      }
    },
    async cancel() {
      await rows.return?.().catch(() => {});
    },
  });
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  return new Response(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Content-Disposition': `attachment; filename="tzurat-review-export-${stamp}.ndjson"`,
      'Cache-Control': 'private, no-store',
    },
  });
}

export async function POST(request) {
  const { denied } = await adminGate(request, 'read');
  if (denied) return denied;
  const { body, tooBig } = await readJsonBody(request, 64 * 1024);
  if (tooBig) return tooBigResponse();
  if (!body?.exportId || typeof body.exportId !== 'string') return badRequest('מזהה הייצוא חסר');
  const result = await acknowledgeExport(body.exportId);
  if (!result.ok) return badRequest(result.error);
  return json({ acknowledged: true });
}
