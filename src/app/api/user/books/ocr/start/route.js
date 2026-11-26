import { startBookOcr } from '@/lib/ocr/bookOcrStart';
import { OWNER_BOOK_OCR } from '@/lib/ocr/bookOcrAccess';

// OCR לספר אישי של המשתמש (תפקיד private_ocr) — אותה לוגיקה כמו בניהול, רק על ספרים שלו.
// ספק local בונה את PDF הקלט לפני התשובה (ראו src/lib/ocr/bookOcrStart.js)
export const maxDuration = 300;

export async function POST(request) {
  const res = await startBookOcr(request, OWNER_BOOK_OCR);
  // תלוי-בצופה — אסור במטמון משותף, גם תגובת שגיאה
  res.headers.set('Cache-Control', 'private, no-store');
  return res;
}
