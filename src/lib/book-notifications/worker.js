// תור ההודעות על ספרים חדשים (issue #306).
//
// לפני כן "הצג ושלח הודעה" שלח את כל המיילים (מאות) בתוך בקשת ה-HTTP: nginx ניתק אחרי 60
// שניות (504, "השרת לא עונה"), המנהל לחץ שוב — וכל לחיצה שלחה את כל הרשימה מחדש, עד שספק
// המייל חסם את החשבון ("short-term recipient limit"), כולל מיילים אחרים של האתר.
//
// עכשיו:
//  1. הבקשה רק מכניסה לתור (enqueueBookNotification) — רשומה אחת לכל ספר, אינדקס ייחודי,
//     כך שלחיצה חוזרת / ניסיון חוזר לא שולחים שוב.
//  2. השליחה במנות קטנות עם מרווח (processDueBatch), וכשהספק מגביל — עוצרים ומחכים.
//  3. ההמשך: טיימר בתהליך (scheduleBookNotifications) + cron כרשת ביטחון אחרי הפעלה מחדש
//     (/api/cron/book-notifications). לא שולחים בשבת וביום טוב.
import dbConnect from '@/lib/db';
import BookNotification from '@/models/BookNotification';
import MailingList from '@/models/MailingList';
import User from '@/models/User';
import { buildBookNotificationMail } from '@/lib/emailService';
import { createCustomSmtpTransport } from '@/lib/smtp-transport';
import { shabbatGate } from '@/lib/shabbat-cache';
import { classifySendError, errorSummary, planAfterBatch, readConfig, uniqueEmails } from './policy';

const LIST_NAME = 'new_books_subscribers';
const LOG = '[book-notifications]';

/** הכתובות שרשומות כרגע לרשימה ושייכות למשתמש מאומת. אם only נתון — רק מתוכן. */
async function subscribedEmails(only) {
  const list = await MailingList.findOne({ listName: LIST_NAME }).select('emails').lean();
  let emails = uniqueEmails(list?.emails);
  if (only) {
    const wanted = new Set(only);
    emails = emails.filter((e) => wanted.has(e));
  }
  if (emails.length === 0) return [];
  const users = await User.find({ email: { $in: emails }, isVerified: true }).select('email').lean();
  const verified = new Set(users.map((u) => u.email));
  return emails.filter((e) => verified.has(e));
}

/**
 * מכניס לתור הודעה על הספר — פעם אחת לכל ספר.
 * @returns {Promise<{ status: 'queued' | 'already_queued' | 'already_sent' | 'no_subscribers', total: number }>}
 */
export async function enqueueBookNotification(book, { requestedBy } = {}) {
  await dbConnect();
  const existing = await BookNotification.findOne({ book: book._id }).select('status total').lean();
  if (existing) return { status: existing.status === 'queued' ? 'already_queued' : 'already_sent', total: existing.total };

  const recipients = await subscribedEmails();
  if (recipients.length === 0) return { status: 'no_subscribers', total: 0 };

  try {
    await BookNotification.create({
      book: book._id,
      bookName: book.name,
      bookSlug: book.slug,
      requestedBy,
      pending: recipients,
      total: recipients.length,
    });
  } catch (err) {
    // שתי בקשות במקביל — השנייה נתקלת באינדקס הייחודי
    if (err?.code === 11000) return { status: 'already_queued', total: recipients.length };
    throw err;
  }
  console.log(`${LOG} queued book=${book._id} recipients=${recipients.length}`);
  return { status: 'queued', total: recipients.length };
}

/**
 * מנה אחת מהרשומה הבאה שמגיע זמנה. לא זורק על כשלי SMTP — הם נרשמים ברשומה.
 * @returns {Promise<{ idle: true } | { jobId: string, sent: number, failed: number, skipped: number, remaining: number, status: string, stop?: string }>}
 */
export async function processDueBatch({ now = () => new Date(), config = readConfig(), transport } = {}) {
  await dbConnect();
  const start = now();
  const job = await BookNotification.findOneAndUpdate(
    {
      status: 'queued',
      nextAttemptAt: { $lte: start },
      $or: [{ leaseUntil: null }, { leaseUntil: { $lt: start } }],
    },
    { $set: { leaseUntil: new Date(start.getTime() + config.leaseMs) } },
    { sort: { nextAttemptAt: 1 }, returnDocument: 'after' },
  ).lean();
  if (!job) return { idle: true };

  if (await shabbatGate.isAssurBemlacha()) {
    await BookNotification.updateOne(
      { _id: job._id },
      { $set: { leaseUntil: null, nextAttemptAt: new Date(now().getTime() + config.holyDayRetryMs) } },
    );
    return { jobId: String(job._id), sent: 0, failed: 0, skipped: 0, remaining: job.pending.length, status: 'queued', stop: 'holy_day' };
  }

  const batch = job.pending.slice(0, config.batchSize);
  // מי שהסיר את עצמו מהרשימה מאז שההודעה נכנסה לתור — לא שולחים לו
  const stillSubscribed = new Set(await subscribedEmails(batch));
  const mailer = transport || createCustomSmtpTransport('mailing_list');

  const sent = [];
  const failed = [];
  const skipped = [];
  let stop = null;
  let lastError = null;
  for (const email of batch) {
    // שרת מייל איטי במיוחד: לא חורגים מהנעילה (אחרת ריצה אחרת תיקח את אותה רשומה ותשלח שוב)
    if (now().getTime() - start.getTime() > config.leaseMs / 2) break;
    if (!stillSubscribed.has(email)) {
      skipped.push(email);
      continue;
    }
    try {
      await mailer.sendMail(buildBookNotificationMail({ email, bookName: job.bookName, bookSlug: job.bookSlug }));
      sent.push(email);
    } catch (err) {
      const kind = classifySendError(err);
      lastError = errorSummary(err);
      if (kind === 'recipient') {
        failed.push(email);
        console.warn(`${LOG} recipient rejected book=${job.book}: ${lastError}`);
        continue;
      }
      stop = kind;
      console.error(`${LOG} paused (${kind}) book=${job.book} after ${sent.length} sent in batch: ${lastError}`);
      break;
    }
  }

  const handled = [...sent, ...failed, ...skipped];
  const remaining = job.pending.length - handled.length;
  const plan = planAfterBatch({ remaining, deferrals: job.deferrals || 0, stop }, config);
  const finished = now();
  const $set = { leaseUntil: null, status: plan.status, deferrals: plan.deferrals };
  if (plan.delayMs !== null) $set.nextAttemptAt = new Date(finished.getTime() + plan.delayMs);
  if (plan.status === 'done') $set.completedAt = finished;
  if (lastError) $set.lastError = lastError;

  await BookNotification.updateOne(
    { _id: job._id },
    {
      $set,
      $pull: { pending: { $in: handled } },
      $inc: { sentCount: sent.length, failedCount: failed.length, skippedCount: skipped.length },
    },
  );

  const total = job.total || job.pending.length;
  console.log(
    `${LOG} book=${job.book} batch sent=${sent.length} failed=${failed.length} skipped=${skipped.length}` +
    ` progress=${(job.sentCount || 0) + sent.length}/${total} remaining=${remaining} status=${plan.status}` +
    (plan.delayMs !== null ? ` next_in=${Math.round(plan.delayMs / 1000)}s` : ''),
  );
  if (plan.status === 'failed') console.error(`${LOG} gave up book=${job.book} after ${plan.deferrals} pauses: ${lastError}`);

  return { jobId: String(job._id), sent: sent.length, failed: failed.length, skipped: skipped.length, remaining, status: plan.status, ...(stop ? { stop } : {}) };
}

/** מתי הרשומה הבאה צריכה מנה (או null אם התור ריק) */
async function nextDueAt() {
  const next = await BookNotification.findOne({ status: 'queued' }).sort({ nextAttemptAt: 1 }).select('nextAttemptAt').lean();
  return next ? new Date(next.nextAttemptAt) : null;
}

// טיימר אחד לתהליך. הנעילה ב-DB (leaseUntil) מגינה גם אם יש יותר מעותק אחד של המודול.
const MAX_TIMER_MS = 60 * 60_000;
let timer = null;
let timerAt = 0;
let running = null;

function arm(at) {
  const delay = Math.min(Math.max(at.getTime() - Date.now(), 1_000), MAX_TIMER_MS);
  const target = Date.now() + delay;
  if (timer && timerAt <= target) return;
  if (timer) clearTimeout(timer);
  timerAt = target;
  timer = setTimeout(() => {
    timer = null;
    timerAt = 0;
    runBookNotifications().catch((err) => console.error(`${LOG} run failed:`, err?.message));
  }, delay);
}

/**
 * מריץ את כל המנות שמגיע זמנן עכשיו (עד maxBatches), ומתזמן את ההמשך בתהליך.
 * בטוח לקריאה מכמה מקומות במקביל.
 */
export function runBookNotifications({ maxBatches = 5 } = {}) {
  if (running) return running;
  running = (async () => {
    const results = [];
    try {
      for (let i = 0; i < maxBatches; i += 1) {
        const result = await processDueBatch();
        if (result.idle) break;
        results.push(result);
      }
      const at = await nextDueAt();
      if (at) arm(at);
    } finally {
      running = null;
    }
    return results;
  })();
  return running;
}
