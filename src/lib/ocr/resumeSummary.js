import { resumeFailureBacksOff } from './localApply.pure.js';

/**
 * סיכום תוצאות השלמת קליטות תקועות (resumeStalledApplies) לתשובת ה-cron (סקירה W08).
 * - succeeded: ok:true — applied, cancelled (ack ביטול נשמר והעבודה נסגרה), already_closed.
 * - contention: ok:false צפוי שאינו כשל של העבודה (אותה הגדרה כמו resumeFailureBacksOff):
 *   apply_in_progress (החלה חיה מקבילה), not_stalled, not_found.
 * - failed: כל השאר — קבוע (result_unavailable/result_corrupt/result_invalid/job_closed) או זמני
 *   (internal_error, קוד של חריגה שנזרקה). העבודה נשארה לא-מושלמת, ולכן מכשיל את ok של הריצה.
 * @param {{jobId?:string, ok:boolean, code?:string}[]} results
 */
export function summarizeResumeResults(results = []) {
  let succeeded = 0;
  let contention = 0;
  let failed = 0;
  const failedCodes = new Map();
  for (const r of results) {
    if (r.ok) succeeded += 1;
    else if (!resumeFailureBacksOff(r.code)) contention += 1;
    else {
      failed += 1;
      const c = String(r.code ?? 'error');
      failedCodes.set(c, (failedCodes.get(c) ?? 0) + 1);
    }
  }
  return { attempted: results.length, succeeded, contention, failed, failedCodes: Object.fromEntries(failedCodes) };
}
