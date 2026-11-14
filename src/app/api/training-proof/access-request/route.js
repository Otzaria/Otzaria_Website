import TrainingProofVolunteer from '@/models/TrainingProofVolunteer';
import { requireTrainingProofSession } from '@/lib/trainingProof/access';
import { canRequest } from '@/lib/trainingProof/accessRules';
import { ok, fail, smallBody } from '@/lib/trainingProof/routeUtils';

const MAX_MESSAGE = 1000;

// POST {message?} — "בקשת גישה" (docs/75 ה-1): נשמרת ב-TrainingProofVolunteer במצב pending,
// ומופיעה במסך הניהול. מי שבקשתו נדחתה או שגישתו הופסקה — יכול לבקש שוב. מי שכבר
// ממתין או מאושר — אין מה לשלוח. ← {access:'pending'}
export async function POST(request) {
  const { userId, access, error } = await requireTrainingProofSession({ anyone: true });
  if (error) return error;
  const { body, error: bodyError } = await smallBody(request);
  if (bodyError) return bodyError;
  if (!canRequest(access)) {
    return fail(409, access === 'pending' ? 'הבקשה שלך כבר נשלחה ומחכה לאישור' : 'כבר יש לך גישה לדף');
  }
  const message = typeof body.message === 'string' ? body.message.trim().slice(0, MAX_MESSAGE) : '';
  try {
    // מותנה במצב הקודם — שתי לחיצות מהירות לא יוצרות שתי רשומות ולא דורסות אישור
    await TrainingProofVolunteer.updateOne(
      { userId, status: { $in: ['denied', 'revoked'] } },
      { $set: { status: 'pending', requestMessage: message, requestedAt: new Date(), decidedAt: null, decidedBy: null } }
    );
    await TrainingProofVolunteer.updateOne(
      { userId },
      { $setOnInsert: { userId, status: 'pending', requestMessage: message, requestedAt: new Date() } },
      { upsert: true }
    );
    return ok({ access: 'pending' });
  } catch (e) {
    if (e?.code === 11000) return ok({ access: 'pending' });
    console.error('training-proof access-request', e);
    return fail(500, 'שליחת הבקשה נכשלה — נסו שוב');
  }
}
