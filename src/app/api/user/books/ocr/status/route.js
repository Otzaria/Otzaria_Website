import { getBookOcrStatus } from '@/lib/ocr/bookOcrStatus';
import { OWNER_BOOK_OCR } from '@/lib/ocr/bookOcrAccess';

// מצב ה-OCR של ספר אישי של המשתמש (תפקיד private_ocr)
export async function GET(request) {
  const res = await getBookOcrStatus(request, OWNER_BOOK_OCR);
  // תלוי-בצופה — אסור במטמון משותף, גם תגובת שגיאה
  res.headers.set('Cache-Control', 'private, no-store');
  return res;
}
