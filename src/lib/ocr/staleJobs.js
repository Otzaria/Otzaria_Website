import OcrJob from '@/models/OcrJob';

// כל עבודת OCR שנשארה במצב 'running' אך לא עודכנה מעבר לסף הזמן הזה
// נחשבת יתומה — כנראה תהליך השרת הופעל מחדש/קרס באמצע העיבוד, ואין מי
// שימשיך אותה. מסמנים אותה ככשל כדי לא לתקוע את תצוגת ההתקדמות ולא לחסום
// (דרך האינדקס החלקי) פתיחת עבודה חדשה לאותו ספר.
const STALE_MS = Number(process.env.OCR_JOB_STALE_MS) || 10 * 60 * 1000;

// מסמן עבודות תקועות ככשל. אם מועבר bookId — מצומצם לספר אחד.
export async function reapStaleOcrJobs(bookId) {
  const cutoff = new Date(Date.now() - STALE_MS);
  const filter = { status: 'running', updatedAt: { $lt: cutoff } };
  if (bookId) filter.book = bookId;

  await OcrJob.updateMany(filter, {
    $set: {
      status: 'failed',
      error: 'העבודה הופסקה (כנראה השרת הופעל מחדש באמצע העיבוד)',
      finishedAt: new Date(),
    },
  });
}
