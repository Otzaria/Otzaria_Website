import OcrWorkerState from '@/models/OcrWorkerState';
import { withWorker, workerError, workerJson, readJsonBody } from '@/lib/ocr/workerHttp';
import { CAPABILITIES_MAX_BYTES, normalizeCapabilities } from '@/lib/ocr/proofreadingCapabilities';

export const dynamic = 'force-dynamic';
export const POST = withWorker(async (request, { workerId }) => {
  const parsed = await readJsonBody(request, CAPABILITIES_MAX_BYTES);
  if (!parsed.ok) return workerError(parsed.status, parsed.error);
  const capabilities = normalizeCapabilities(parsed.body);
  if (!capabilities) return workerError(422, 'invalid_capabilities');
  await OcrWorkerState.updateOne({ workerId }, { $set: {
    proofreadingCapabilities: capabilities, capabilitiesReceivedAt: new Date(),
  } }, { upsert: true });
  return workerJson(200, { ok: true });
});
