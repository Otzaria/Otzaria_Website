import mongoose from 'mongoose';
import { enqueueBookNotification, runBookNotifications } from './worker';

/**
 * מהראוטים של ניהול הספרים: מכניס את ההודעה לתור ומפעיל את השליחה אחרי שהתשובה יצאה.
 * לא זורק — הספר כבר עודכן, וכשל בתור מוחזר כ-status: 'error' כדי שהממשק יגיד את זה.
 * @param {{ _id: unknown, name: string, slug?: string }} book
 * @param {{ requestedBy?: string, schedule: (work: () => Promise<unknown>) => void }} options
 *   schedule — after() של next/server
 */
export async function queueBookNotification(book, { requestedBy, schedule }) {
  try {
    const result = await enqueueBookNotification(book, {
      requestedBy: mongoose.isValidObjectId(requestedBy) ? requestedBy : undefined,
    });
    if (result.status === 'queued' || result.status === 'already_queued') {
      schedule(() => runBookNotifications().catch((err) => console.error('[book-notifications] run failed:', err?.message)));
    }
    return result;
  } catch (err) {
    console.error('[book-notifications] enqueue failed:', err?.message);
    return { status: 'error', total: 0 };
  }
}
