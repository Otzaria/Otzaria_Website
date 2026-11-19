import { cancelBookOcr } from '@/lib/ocr/bookOcrCancel';
import { OWNER_BOOK_OCR } from '@/lib/ocr/bookOcrAccess';

// עצירת OCR בספר אישי של המשתמש (תפקיד private_ocr)
export async function POST(request) {
  const res = await cancelBookOcr(request, OWNER_BOOK_OCR);
  // תלוי-בצופה — אסור במטמון משותף, גם תגובת שגיאה
  res.headers.set('Cache-Control', 'private, no-store');
  return res;
}
