import { adminGate, fail, sectionOf, crash, NO_STORE } from '../../_lib/http';
import { startExport } from '../../_lib/exporter';

export const maxDuration = 60;

// POST — מוריד את קובץ-ההחזרה לתחנה של החלק (docs/76 §5): כל מה שאושר, בלי תמונות.
// POST ולא GET — כי ההורדה מוחקת: הפריטים, התמונות, תמונות-הקשר שהתייתמו וחבילות
// שהתרוקנו נמחקים רק אחרי שהשרת סיים לשלוח את הקובץ (ה-13). נשאר יומן בלבד.
// 409 — אין מה להוריד, או שהורדה של אותו חלק כבר רצה.
export async function POST(_request, { params }) {
  const { userId, error } = await adminGate();
  if (error) return error;
  const { section: raw } = await params;
  const section = sectionOf(raw);
  if (!section) return fail(400, 'חלק לא מוכר');
  try {
    const r = await startExport(section, userId);
    if (r.error) return fail(r.status || 409, r.error);
    return new Response(r.stream, {
      headers: {
        ...NO_STORE,
        'Content-Type': 'application/zip',
        'Content-Length': String(r.bytes.length),
        'Content-Disposition': `attachment; filename="${r.exportId}-${section}.zip"`,
        'X-Export-Id': r.exportId,
        'X-Item-Count': String(r.count),
      },
    });
  } catch (e) {
    return crash('export', e, 'בניית הקובץ נכשלה — שום דבר לא נמחק');
  }
}
