import { startBookOcr } from '@/lib/ocr/bookOcrStart';
import { ADMIN_BOOK_OCR } from '@/lib/ocr/bookOcrAccess';

// ספק local בונה את PDF הקלט לפני התשובה (ראו src/lib/ocr/bookOcrStart.js)
export const maxDuration = 300;

export async function POST(request) {
  return startBookOcr(request, ADMIN_BOOK_OCR);
}
