import { adminGate, ok, fail, jsonBody, idList, sectionOf, crash } from '../../_lib/http';
import { approveIds, rejectIds, unapproveIds } from '../../_lib/review';

// POST {section, ids:[…], decision:'approve'|'reject'|'unapprove'} ← {count}
// אישור/דחייה של שורות מסומנות (או של שורה אחת), ו"החזר לממתינות" למה שאושר ועוד לא
// הורד. דחייה מחזירה את הפריט למאגר, ואותו מתנדב לא יקבל אותו שוב (docs/76 §8.2).
const DO = { approve: approveIds, reject: rejectIds, unapprove: unapproveIds };

export async function POST(request) {
  const { userId, error } = await adminGate();
  if (error) return error;
  const { body, error: bad } = await jsonBody(request);
  if (bad) return bad;
  const section = sectionOf(body.section);
  const ids = idList(body.ids);
  const fn = DO[body.decision];
  if (!section || !ids || !fn) return fail(400, 'חסרים חלק, פריטים או החלטה');
  try {
    const count = body.decision === 'approve' ? await fn(section, ids, userId) : await fn(section, ids);
    return ok({ count, asked: ids.length });
  } catch (e) {
    return crash('decide', e);
  }
}
