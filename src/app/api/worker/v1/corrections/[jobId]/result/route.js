// POST /api/worker/v1/corrections/{jobId}/result (X-Lease-Token) — ההחלטה של שירות הבדיקה.
// הגוף הוא תשובת חוזה B §3.2 (עד 1MiB; שדות נוספים כמו evidence נסבלים). 200 {outcome} אחרי אימות
// וניתוב כמו בדחיפה; 409 כשה-lease אינו בתוקף / generation ישן (ההחלטה נשמרת לתיעוד בלבד);
// 422 invalid_result כשהתשובה פגומה (הדיווח עובר לידני). בהשהיה/כיבוי — 200 {outcome:'cancelled', cancelled:true}
// כמו בדופק, בלי להחיל. שליחה חוזרת של אותו גוף — אותה תשובה.
import { after } from 'next/server';
import { submitVerifyResult } from '@/lib/corrections/agent';
import { triggerWorkerBatch } from '@/lib/corrections/run-batch';
import { withAgent, agentJson, agentFailure, readAgentBody } from '../../_shared';

export const dynamic = 'force-dynamic';

export const POST = withAgent(async (request, { agentId, config, params }) => {
  const read = await readAgentBody(request, config.agent.maxResultBytes);
  if (!read.ok) return agentFailure(read);
  const result = await submitVerifyResult({
    config, agentId, jobId: params.jobId, token: request.headers.get('x-lease-token'), raw: read.raw, body: read.body,
    // מייל "כבר תוקן" למדווח (כשהשירות קבע כך והאתר אימת) — אחרי התשובה.
    deps: { schedule: (work) => after(work) },
  });
  if (!result.ok) return agentFailure(result);
  // אישור שמותר לפרסום: אצווה מיד אחרי התשובה (כמו אחרי אישור מתנדב), כדי שהפרסום לא ימתין ל-cron.
  if (result.publish) triggerWorkerBatch((work) => after(work), 'agent result trigger failed');
  return agentJson(200, { outcome: result.outcome, ...(result.cancelled ? { cancelled: true } : {}), ...(result.duplicate ? { duplicate: true } : {}) });
});
