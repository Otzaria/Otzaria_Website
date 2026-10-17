import { requireAppReportsAccess, jsonNoStore } from '@/lib/app-reports/route-auth';
import { loadContactImage } from '@/lib/app-reports/service';
import { getFileFromGridFS } from '@/lib/gridfs-service';

export const dynamic = 'force-dynamic';

// תמונה מתשובת מדווח במייל (entry = מיקום התשובה בהיסטוריה), מוצגת בדף הניהול. הסוג אומת לפי הבתים בקליטה.
export async function GET(_request, { params }) {
  const auth = await requireAppReportsAccess();
  if (!auth.ok) return auth.response;
  try {
    const { reportId, entry, index } = await params;
    const image = await loadContactImage(String(reportId), String(entry), String(index), getFileFromGridFS);
    if (!image) return jsonNoStore({ error: 'Image not found' }, 404);
    return new Response(image.buffer, {
      status: 200,
      headers: {
        'content-type': image.contentType,
        'content-disposition': `inline; filename="${image.filename}"`,
        'x-content-type-options': 'nosniff',
        'content-security-policy': "default-src 'none'; sandbox",
        'cache-control': 'private, no-store',
      },
    });
  } catch (error) {
    console.error('App report reply image download failed:', error?.message);
    return jsonNoStore({ error: 'Failed to load image' }, 500);
  }
}
