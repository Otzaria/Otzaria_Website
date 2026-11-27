// POST /api/worker/v1/corrections/{jobId}/heartbeat (X-Lease-Token) — מאריך את ה-lease.
// 200 {leaseExpiresAt, cancelled}: cancelled=true → להפסיק ולזרוק את העבודה (מתנדב לקח את הדיווח,
// הדיווח השתנה, המשימה בוטלה או שעבר מועדה). 409 lease_invalid/lease_expired, 404 not_found.
import { heartbeatVerifyJob } from '@/lib/corrections/agent';
import { withAgent, agentJson, agentFailure } from '../../_shared';

export const dynamic = 'force-dynamic';

export const POST = withAgent(async (request, { config, params }) => {
  const beat = await heartbeatVerifyJob({ config, jobId: params.jobId, token: request.headers.get('x-lease-token') });
  if (!beat.ok) return agentFailure(beat);
  return agentJson(200, { leaseExpiresAt: beat.leaseExpiresAt, cancelled: beat.cancelled });
});
