// תפיסת עמודים בעריכת ספרים — פעולות מסד הנתונים (מכסה + שחרור אוטומטי).
// המדיניות עצמה (מספרים, טקסטים, חישובי זמן) ב-pageClaimPolicy.js; כאן רק השאילתות.
// בדיקות אינטגרציה: bookPageClaims.int.test.mjs (MongoDB אמיתי).
import mongoose from 'mongoose';
import Page from '../models/Page.js';
import Book from '../models/Book.js';
import {
  MAX_ACTIVE_PAGE_CLAIMS,
  CLAIM_LIMIT_ERROR_CODE,
  canClaimAnotherPage,
  claimLimitMessage,
  isClaimExpired,
  isPersonalBook,
  pageReleaseCutoff,
} from './pageClaimPolicy.js';

const RELEASE_UPDATE = {
  $set: { status: 'available' },
  $unset: { claimedBy: '', claimedAt: '', completedAt: '', lastAutoReminderAt: '' },
};

/**
 * משחרר עמודים בטיפול שלא נערכו PAGE_RELEASE_AFTER_DAYS ימים (חוץ מספרים אישיים).
 * נקרא מה-cron וגם בכל טעינת ספר — כך השחרור מדויק גם כשה-cron רץ לעיתים רחוקות.
 * העדכון מותנה שוב ב-updatedAt, כדי ששמירה שהגיעה בין השאילתה לעדכון לא תשוחרר.
 * @param {{ now?: Date, bookId?: unknown }} [options]
 * @returns {Promise<number>} מספר העמודים ששוחררו
 */
export async function releaseExpiredPageClaims({ now = new Date(), bookId } = {}) {
  const filter = {
    status: 'in-progress',
    claimedBy: { $ne: null },
    updatedAt: { $lte: pageReleaseCutoff(now) },
  };
  if (bookId) filter.book = bookId;

  const candidates = await Page.find(filter)
    .select('_id book')
    .populate('book', 'isPrivate ownerId')
    .lean();
  const ids = candidates.filter((p) => !isPersonalBook(p.book)).map((p) => p._id);
  if (!ids.length) return 0;

  const result = await Page.updateMany({ ...filter, _id: { $in: ids } }, RELEASE_UPDATE, { timestamps: false });
  return result.modifiedCount || 0;
}

/**
 * כמה עמודים המשתמש מחזיק בטיפול כרגע, לצורך המכסה: בלי ספרים אישיים ובלי
 * עמודים שתוקפם פג (הם ממילא משתחררים).
 */
export async function countActiveClaims(userId, now = new Date()) {
  if (!userId || !mongoose.isValidObjectId(String(userId))) return 0;
  const pages = await Page.find({
    claimedBy: userId,
    status: 'in-progress',
    updatedAt: { $gt: pageReleaseCutoff(now) },
  }).select('book').lean();
  if (!pages.length) return 0;

  const bookIds = [...new Set(pages.map((p) => String(p.book)))];
  const personal = await Book.find({
    _id: { $in: bookIds },
    $or: [{ isPrivate: true }, { ownerId: { $ne: null } }],
  }).select('_id').lean();
  const personalIds = new Set(personal.map((b) => String(b._id)));
  return pages.filter((p) => !personalIds.has(String(p.book))).length;
}

/** תשובת "הגעת למכסה" — אותו מבנה בכל הראוטים */
export function claimLimitBody(activeClaims) {
  return {
    success: false,
    error: claimLimitMessage(),
    code: CLAIM_LIMIT_ERROR_CODE,
    limit: MAX_ACTIVE_PAGE_CLAIMS,
    activeClaims,
  };
}

/**
 * בדיקת מכסה לפני פעולה שמוסיפה עמוד "בטיפול" (תפיסה, ביטול סיום).
 * @returns {Promise<{ ok: true, activeClaims: number } | { ok: false, activeClaims: number }>}
 */
export async function checkClaimLimit({ userId, isAdmin, book, now = new Date() }) {
  if (isAdmin || isPersonalBook(book)) return { ok: true, activeClaims: null };
  const activeClaims = await countActiveClaims(userId, now);
  return { ok: canClaimAnotherPage(activeClaims), activeClaims };
}

/**
 * תפיסת עמוד בידי משתמש.
 * - עמוד פנוי, עמוד שלו, או עמוד של אחר שתוקפו פג (לא בספר אישי) — ניתן לתפוס.
 * - מנהל ספרייה (isAdmin) עוקף גם בעלות וגם מכסה.
 * - העדכון מותנה במצב שנקרא (status + claimedBy), כך ששתי תפיסות במקביל לא דורסות זו את זו.
 * - אחרי התפיסה סופרים שוב; אם בקשות מקבילות של אותו משתמש עברו את המכסה — התפיסה מבוטלת.
 *
 * @returns {Promise<{ status: number, body: object, wasCompleted?: boolean, isNewClaim?: boolean }>}
 */
export async function claimBookPage({ userId, isAdmin, book, pageNumber, now = new Date() }) {
  const page = await Page.findOne({ book: book._id, pageNumber });
  if (!page) return { status: 404, body: { success: false, error: 'Page not found' } };

  const personal = isPersonalBook(book);
  const uid = String(userId);
  const prevClaimedBy = page.claimedBy ? String(page.claimedBy) : null;
  const isMine = prevClaimedBy === uid;
  const expired = page.status === 'in-progress' && !personal && isClaimExpired(page.updatedAt, now);

  if (prevClaimedBy && !isMine && !isAdmin && page.status !== 'available' && !expired) {
    return {
      status: 409,
      body: {
        success: false,
        error: `העמוד כבר ${page.status === 'completed' ? 'הושלם' : 'בטיפול'} ע"י משתמש אחר`,
      },
    };
  }

  // עמוד שכבר נספר במכסה של המשתמש — תפיסה חוזרת שלו אינה מוסיפה עמוד
  const alreadyCounted = isMine && page.status === 'in-progress' && !expired;
  const enforceLimit = !isAdmin && !personal && !alreadyCounted;

  if (enforceLimit) {
    const activeClaims = await countActiveClaims(userId, now);
    if (!canClaimAnotherPage(activeClaims)) return { status: 409, body: claimLimitBody(activeClaims) };
  }

  const guard = { _id: page._id, status: page.status, claimedBy: page.claimedBy ?? null };
  if (expired && !isMine) guard.updatedAt = { $lte: pageReleaseCutoff(now) };

  const claimedAt = now;
  const updated = await Page.findOneAndUpdate(
    guard,
    {
      $set: { status: 'in-progress', claimedBy: new mongoose.Types.ObjectId(uid), claimedAt },
      $unset: { completedAt: '', lastAutoReminderAt: '' },
    },
    { returnDocument: 'after' }
  );
  if (!updated) {
    return {
      status: 409,
      body: { success: false, error: 'מצב העמוד השתנה בדיוק עכשיו. רענן את הדף ונסה שוב.' },
    };
  }

  if (enforceLimit) {
    const after = await countActiveClaims(userId, now);
    if (after > MAX_ACTIVE_PAGE_CLAIMS) {
      // תפיסות מקבילות עברו יחד את המכסה — מחזירים את העמוד בדיוק למצבו הקודם
      await Page.updateOne(
        { _id: page._id, claimedBy: updated.claimedBy, claimedAt },
        {
          $set: {
            status: page.status,
            claimedBy: page.claimedBy ?? null,
            claimedAt: page.claimedAt ?? null,
            completedAt: page.completedAt ?? null,
            updatedAt: page.updatedAt,
          },
        },
        { timestamps: false }
      );
      return { status: 409, body: claimLimitBody(after - 1) };
    }
  }

  const activeClaims = personal || isAdmin ? null : await countActiveClaims(userId, now);
  return {
    status: 200,
    body: {
      success: true,
      page: updated,
      activeClaims,
      limit: MAX_ACTIVE_PAGE_CLAIMS,
    },
    wasCompleted: page.status === 'completed',
    isNewClaim: !isMine,
  };
}
