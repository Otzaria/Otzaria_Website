// POST /api/worker/v1/corrections/{jobId}/release (X-Lease-Token; גוף אופציונלי {retry_after_seconds}) —
// השירות מחזיר את המשימה לתור, למשל כשבניית db או OCR צריכים את המחשב: בלי ניסיון ובלי פקיעת lease.
// 200 {released, nextAttemptAt?}; released=false כשהמשימה כבר אינה של השירות. 409 lease_invalid, 404 not_found.
import { releaseVerifyJob } from '@/lib/corrections/agent';
import { withAgent, agentJson, agentError, agentFailure, readAgentBody } from '../../_shared';

export const dynamic = 'force-dynamic';

const MAX_RELEASE_BODY_BYTES = 4096;

export const POST = withAgent(async (request, { config, params }) => {
  const read = await readAgentBody(request, MAX_RELEASE_BODY_BYTES, { allowEmpty: true });
  if (!read.ok) return agentFailure(read);
  const raw = read.body?.retry_after_seconds;
  if (raw !== undefined && raw !== null && !(Number.isSafeInteger(raw) && raw >= 0)) return agentError(400, 'bad_request');
  const released = await releaseVerifyJob({ config, jobId: params.jobId, token: request.headers.get('x-lease-token'), retryAfterSeconds: raw ?? 0 });
  if (!released.ok) return agentFailure(released);
  return agentJson(200, { released: released.released, ...(released.nextAttemptAt ? { nextAttemptAt: released.nextAttemptAt } : {}) });
});
