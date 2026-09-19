import connectDB from '@/lib/db';
import { loadPublicImage } from '@/lib/app-reports/service';
import { getFileFromGridFS } from '@/lib/gridfs-service';

export const dynamic = 'force-dynamic';

const notFound = () => Response.json({ error: 'Image not found' }, { status: 404, headers: { 'cache-control': 'no-store' } });

// צילום מסך מדיווח, מוטמע ב-issue הציבורי. הגישה לפי טוקן אקראי בלבד;
// התוכן לא משתנה אחרי הקליטה, ולכן מטמון ארוך.
export async function GET(_request, { params }) {
  try {
    const { token } = await params;
    await connectDB();
    const image = await loadPublicImage(String(token), getFileFromGridFS);
    if (!image) return notFound();
    return new Response(image.buffer, {
      status: 200,
      headers: {
        'content-type': image.contentType,
        'content-disposition': 'inline',
        'x-content-type-options': 'nosniff',
        'content-security-policy': "default-src 'none'; sandbox",
        'cache-control': 'public, max-age=31536000, immutable',
      },
    });
  } catch (error) {
    console.error('App report public image failed:', error?.message);
    return Response.json({ error: 'Failed to load image' }, { status: 500, headers: { 'cache-control': 'no-store' } });
  }
}
