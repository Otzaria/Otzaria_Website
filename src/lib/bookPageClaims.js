// תפיסת עמודים בעריכת ספרים — פעולות מסד הנתונים (מכסה + שחרור אוטומטי).
// המדיניות עצמה (מספרים, טקסטים, חישובי זמן) ב-pageClaimPolicy.js; כאן רק השאילתות.
// בדיקות אינטגרציה: bookPageClaims.int.test.mjs (MongoDB אמיתי).
import mongoose from 'mongoose';
import Page, { PAGE_CLAIM_QUOTA_INDEX } from '../models/Page.js';
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
  $unset: { claimedBy: '', claimedAt: '', completedAt: '', lastAutoReminderAt: '', quotaUserId: '', quotaSlot: '' },
};

/**
 * משחרר עמודים בטיפול שלא נערכו PAGE_RELEASE_AFTER_DAYS ימים (חוץ מספרים אישיים).
 * נקרא מה-cron וגם בכל טעינת ספר — כך השחרור מדויק גם כשה-cron רץ לעיתים רחוקות.
 * העדכון מותנה שוב ב-updatedAt, כדי ששמירה שהגיעה בין השאילתה לעדכון לא תשוחרר.
 * @param {{ now?: Date, bookId?: unknown, userId?: unknown }} [options]
 * @returns {Promise<number>} מספר העמודים ששוחררו
 */
export async function releaseExpiredPageClaims({ now = new Date(), bookId, userId } = {}) {
  const filter = {
    status: 'in-progress',
    claimedBy: { $ne: null },
    updatedAt: { $lte: pageReleaseCutoff(now) },
  };
  if (bookId) filter.book = bookId;
  if (userId) filter.claimedBy = userId;

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
 * בדיקת תצוגה בלבד; אינה משמשת לאישור כתיבה. הכתיבות משתמשות במקצה המקומות האטומי.
 * @returns {Promise<{ ok: true, activeClaims: number } | { ok: false, activeClaims: number }>}
 */
export async function checkClaimLimit({ userId, isAdmin, book, now = new Date() }) {
  if (isAdmin || isPersonalBook(book)) return { ok: true, activeClaims: null };
  const activeClaims = await countActiveClaims(userId, now);
  return { ok: canClaimAnotherPage(activeClaims), activeClaims };
}

// ממתינים לבניית האינדקס גם כאשר autoIndex כבוי בפריסה. כשל בבנייה עוצר
// תפיסות חדשות; אסור ליפול בחזרה לספירה לא אטומית. כל חיבור DB נבדק בנפרד.
let indexedDatabase;
let indexReady;
async function ensureQuotaIndex() {
  if (indexedDatabase !== mongoose.connection.db || !indexReady) {
    indexedDatabase = mongoose.connection.db;
    indexReady = Page.collection.createIndex({ quotaUserId: 1, quotaSlot: 1 }, PAGE_CLAIM_QUOTA_INDEX)
      .catch((error) => { indexReady = null; throw error; });
  }
  await indexReady;
}

const hasQuotaSlot = (page, userId) => String(page.quotaUserId) === String(userId) &&
  Number.isInteger(page.quotaSlot) && page.quotaSlot >= 0 && page.quotaSlot < MAX_ACTIVE_PAGE_CLAIMS;
const slotOccupied = (error) => error?.code === 11000 &&
  (error.keyPattern?.quotaUserId === 1 || error.message?.includes(PAGE_CLAIM_QUOTA_INDEX.name));
const changedResult = () => ({ status: 409, body: {
  success: false, error: 'מצב העמוד השתנה בדיוק עכשיו. רענן את הדף ונסה שוב.',
} });

// לצורך הקצאת מקום סופרים תפיסות שקיימות בפועל, גם אם ה-cron עוד לא שחרר אותן.
// בניגוד למונה התצוגה, סינון לפי זמן כאן היה מאפשר לשמירה ישנה להחיות תפיסה.
async function heldQuotaPages(userId) {
  const pages = await Page.find({ claimedBy: userId, status: 'in-progress' })
    .select('_id book quotaUserId quotaSlot').populate('book', 'isPrivate ownerId').lean();
  // גם נתונים שיובאו/עודכנו בניהול חייבים לכבד את הפטור של ספר אישי.
  const exemptIds = pages.filter((page) => isPersonalBook(page.book) &&
    String(page.quotaUserId) === String(userId)).map((page) => page._id);
  if (exemptIds.length) await Page.updateMany({
    _id: { $in: exemptIds }, status: 'in-progress', claimedBy: userId, quotaUserId: userId,
  }, { $unset: { quotaUserId: '', quotaSlot: '' } }, { timestamps: false });
  return pages.filter((page) => !isPersonalBook(page.book));
}

/** ממפה תפיסות קיימות למקומות ייחודיים לפני שמוסיפים תפיסה חדשה. */
async function prepareQuotaSlots(userId) {
  await ensureQuotaIndex();
  // עד חמישה עמודים למיפוי. מגבילים ניסיונות אם המצב ממשיך להשתנות במקביל.
  for (let attempt = 0; attempt < MAX_ACTIVE_PAGE_CLAIMS + 1; attempt++) {
    const pages = await heldQuotaPages(userId);
    if (pages.length >= MAX_ACTIVE_PAGE_CLAIMS) return { full: true, activeClaims: pages.length };
    const missing = pages.filter((page) => !hasQuotaSlot(page, userId));
    if (!missing.length) return { full: false };
    for (const page of missing) {
      for (let slot = 0; slot < MAX_ACTIVE_PAGE_CLAIMS; slot++) {
        try {
          // שני תהליכים יכולים למפות אותו עמוד; רק הראשון משנה את השדות שנקראו.
          await Page.findOneAndUpdate({
            _id: page._id, status: 'in-progress', claimedBy: userId,
            quotaUserId: page.quotaUserId ?? null, quotaSlot: page.quotaSlot ?? null,
          }, { $set: { quotaUserId: userId, quotaSlot: slot } }, { timestamps: false });
          break;
        } catch (error) {
          if (!slotOccupied(error)) throw error;
        }
      }
    }
  }
  return { changed: true };
}

/**
 * תפיסה אטומית: מקום במכסה וסטטוס העמוד נכתבים באותו מסמך.
 * כישלון בהקצאת מקום אינו משנה את העמוד, ולכן אין ביטול מאוחר שיכול לדרוס סיום.
 */
async function writeClaim({ userId, isAdmin, book, page, update }) {
  const exempt = isAdmin || isPersonalBook(book);
  const alreadyHeld = page.status === 'in-progress' && String(page.claimedBy) === String(userId);
  const guard = {
    _id: page._id, status: page.status, claimedBy: page.claimedBy ?? null,
    claimedAt: page.claimedAt ?? null, updatedAt: page.updatedAt,
  };
  if (exempt || alreadyHeld) {
    // תפיסה חוזרת של עמוד קיים אינה מוסיפה מקום, גם למשתמש ותיק שמחזיק יותר מחמישה.
    const fields = exempt ? { ...update, $unset: { ...update.$unset, quotaUserId: '', quotaSlot: '' } } : update;
    const updated = await Page.findOneAndUpdate(guard, fields, { returnDocument: 'after' });
    return updated ? { updated } : changedResult();
  }
  const quota = await prepareQuotaSlots(userId);
  if (quota.full) return { status: 409, body: claimLimitBody(quota.activeClaims) };
  if (quota.changed) return changedResult();
  for (let slot = 0; slot < MAX_ACTIVE_PAGE_CLAIMS; slot++) {
    try {
      const updated = await Page.findOneAndUpdate(guard, {
        ...update, $set: { ...update.$set, quotaUserId: userId, quotaSlot: slot },
      }, { returnDocument: 'after' });
      return updated ? { updated } : changedResult();
    } catch (error) {
      if (!slotOccupied(error)) throw error;
    }
  }
  return { status: 409, body: claimLimitBody((await heldQuotaPages(userId)).length) };
}

export async function claimBookPage({ userId, isAdmin, book, pageNumber, now = new Date() }) {
  const beforeRelease = await Page.findOne({ book: book._id, pageNumber });
  if (!beforeRelease) return { status: 404, body: { success: false, error: 'Page not found' } };
  const personal = isPersonalBook(book);
  // שחרור בפועל בכל ספרי המשתמש לפני הקצאה חדשה: שמירה ישנה לא יכולה להחיות
  // את הסטטוס אחרי השחרור, ושמירה שקדמה לו נבדקת שוב במסנן updatedAt של השחרור.
  if (!isAdmin && !personal) await releaseExpiredPageClaims({ now, userId });
  const page = await Page.findById(beforeRelease._id);
  if (!page) return changedResult();
  const uid = String(userId);
  const isMine = String(page.claimedBy) === uid;
  const expired = page.status === 'in-progress' && !personal && isClaimExpired(page.updatedAt, now);
  if (page.claimedBy && !isMine && !isAdmin && page.status !== 'available' && !expired) {
    return { status: 409, body: { success: false,
      error: `העמוד כבר ${page.status === 'completed' ? 'הושלם' : 'בטיפול'} ע"י משתמש אחר`,
    } };
  }
  const written = await writeClaim({ userId, isAdmin, book, page, update: {
    $set: { status: 'in-progress', claimedBy: new mongoose.Types.ObjectId(uid), claimedAt: now },
    $unset: { completedAt: '', lastAutoReminderAt: '' },
  } });
  if (!written.updated) return written;
  return {
    status: 200,
    body: { success: true, page: written.updated,
      activeClaims: personal || isAdmin ? null : await countActiveClaims(userId, now),
      limit: MAX_ACTIVE_PAGE_CLAIMS,
    },
    wasCompleted: page.status === 'completed',
    // גם חידוש תפיסה שלי שפג תוקפה אינו מעניק חמש נקודות נוספות.
    isNewClaim: !isMine && String(beforeRelease.claimedBy) !== uid,
  };
}

/** ביטול סיום משתמש באותו מקצה מקומות, ללא טרנזקציה שאינה נתמכת ב-standalone. */
export async function uncompleteBookPage({ userId, isAdmin, pageId, now = new Date() }) {
  const query = { _id: pageId, status: 'completed', ...(!isAdmin ? { claimedBy: userId } : {}) };
  const page = await Page.findOne(query);
  if (!page) return { status: 400, body: { error: 'Page update failed or page not found' } };
  const book = await Book.findById(page.book);
  if (!book) return { status: 400, body: { error: 'Page update failed or page not found' } };
  const ownerId = page.claimedBy || userId;
  if (!isAdmin && !isPersonalBook(book)) await releaseExpiredPageClaims({ now, userId: ownerId });
  const written = await writeClaim({ userId: ownerId, isAdmin, book, page, update: {
    $set: { status: 'in-progress' }, $unset: { completedAt: '', lastAutoReminderAt: '' },
  } });
  return written.updated ? { status: 200, page: written.updated } : written;
}
