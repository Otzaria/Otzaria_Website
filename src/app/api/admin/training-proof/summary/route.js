import { adminGate, ok, crash } from '../_lib/http';
import { summaryCounts } from '../_lib/review';

// GET — המונים בראש מסך הניהול: לכל חלק פנוי · אצל מתנדב · ממתין לאישור · אושר ועוד לא
// הורד; ומספר בקשות-הגישה הממתינות. רק מנהל OCR; private, no-store.
export async function GET() {
  const { error } = await adminGate();
  if (error) return error;
  try {
    return ok(await summaryCounts());
  } catch (e) {
    return crash('summary', e);
  }
}
