// POST /api/worker/v1/corrections/claim — שירות הבדיקה (מצב משיכה) תופס את משימת הבדיקה הבאה.
// 200 {jobId, leaseToken, leaseExpiresAt, request} — request הוא גוף חוזה B §3.1 בדיוק.
// אין עבודה (או שהבדיקה כבויה/מושהית): 204 + Retry-After. החוזה: docs/text-corrections/CONTRACT.md §3.7.
import { after } from 'next/server';
import { claimVerifyJob } from '@/lib/corrections/agent';
import { triggerWorkerBatch } from '@/lib/corrections/run-batch';
import { withAgent, agentJson, agentNoContent } from '../_shared';

export const dynamic = 'force-dynamic';

export const POST = withAgent(async (request, { agentId, config, startedAt }) => {
  // מייל למדווח על סגירה אוטומטית של "כבר תוקן" — אחרי התשובה, לא בתוך התפיסה. תקציב התפיסה — מהכניסה לראוט.
  const claimed = await claimVerifyJob({ config, agentId, startedAt, deps: { schedule: (work) => after(work) } });
  // בלי cron: התפיסה מריצה אצווה מלאה אחרי התשובה כשיש פרסום ממתין או שלא רצה אצווה זמן רב.
  if (claimed.batchDue) triggerWorkerBatch((work) => after(work), 'agent claim trigger failed');
  if (!claimed.job) return agentNoContent(claimed.retryAfter);
  return agentJson(200, claimed.job);
});
