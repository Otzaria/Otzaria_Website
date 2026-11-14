import { serveItemImage } from '@/lib/trainingProof/imageRoute';

// GET — תמונת השורה (בגודל המקורי; התיבות של המילים בפיקסלים שלה)
export async function GET(request, { params }) {
  return serveItemImage(params, 'imagePath');
}
