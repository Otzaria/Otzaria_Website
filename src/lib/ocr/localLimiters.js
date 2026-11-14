// מגבילי עומס משותפים לעבודה המקומית (בתוך תהליך אחד): הקליטה/החלה של תוצאה ובניית קלט PDF
// קוראות ומפענחות קבצים גדולים בזיכרון, ולכן לכל היותר אחת מכל סוג רצה בו-זמנית.
import { createSemaphore } from '../semaphore.js';

// קליטת תוצאה (קריאה+פענוח+ולידציה+החלה) ו-resumeStalledApplies חולקים מגביל אחד
export const resultIntakeLimiter = createSemaphore(1);
// תקרת ההמתנה בתור — נמוכה ממועד ה-HTTP של העובד; מעליה 503 + Retry-After
export const RESULT_INTAKE_WAIT_MS = 120_000;
export const RESULT_INTAKE_RETRY_AFTER_SEC = 30;

export const jobInputBuildLimiter = createSemaphore(1);
export const JOB_INPUT_BUILD_WAIT_MS = 120_000;
