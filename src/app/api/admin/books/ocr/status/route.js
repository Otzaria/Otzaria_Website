import { getBookOcrStatus } from '@/lib/ocr/bookOcrStatus';
import { ADMIN_BOOK_OCR } from '@/lib/ocr/bookOcrAccess';

export async function GET(request) {
  return getBookOcrStatus(request, ADMIN_BOOK_OCR);
}
