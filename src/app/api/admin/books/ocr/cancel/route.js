import { cancelBookOcr } from '@/lib/ocr/bookOcrCancel';
import { ADMIN_BOOK_OCR } from '@/lib/ocr/bookOcrAccess';

export async function POST(request) {
  return cancelBookOcr(request, ADMIN_BOOK_OCR);
}
