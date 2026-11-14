import { serveAdminImage } from '../../../_lib/image';

// GET — תמונת הפריט (השורה, או העמוד בגלאי) למסך הניהול. רק מנהל OCR.
export async function GET(_request, { params }) {
  return serveAdminImage(params, 'imagePath');
}
