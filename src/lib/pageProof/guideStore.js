import { unstable_cache } from 'next/cache';
import connectDB from '@/lib/db';
import SystemConfig from '@/models/SystemConfig';
import { CACHE_TAGS, revalidateNow } from '@/lib/cacheTags';
import { GUIDE_KEY, guideInput } from './guideContent.js';

// דף ההנחיות להגהת עמודים — הנוסח שנשמר בדף הניהול (SystemConfig 'page_proof_guide': {html, byName, at}). הכללים
// הטהורים (הניקוי, הקודים, הנוסח המקורי) — guideContent.js. הדף הציבורי קורא דרך מטמון עם תגית (cacheTags), וכל שמירה
// מבטלת אותו מיד (revalidateNow) — כך שהנוסח החדש מופיע בטעינה הבאה.

async function readGuide() {
  await connectDB();
  const doc = await SystemConfig.findOne({ key: GUIDE_KEY }, { value: 1, updatedAt: 1 }).lean();
  const v = doc?.value;
  if (!v || typeof v.html !== 'string' || !v.html) return null;
  return { html: v.html, byName: String(v.byName || ''), at: v.at ? new Date(v.at).toISOString() : doc.updatedAt ? new Date(doc.updatedAt).toISOString() : null };
}

// הנוסח השמור, או null (← הנוסח המקורי). כשל במסד — null: הדף הציבורי נשאר זמין עם הנוסח המקורי
const cachedGuide = unstable_cache(readGuide, ['page-proof-guide'], { tags: [CACHE_TAGS.PAGE_PROOF_GUIDE], revalidate: 3600 });
export async function loadGuide() {
  try {
    return await cachedGuide();
  } catch (e) {
    console.error('page-proof guide load', e?.name);
    return null;
  }
}

// לדף הניהול — בלי מטמון
export const loadGuideFresh = readGuide;

// שמירה ← {ok, html, at} או {ok:false, status, error}
export async function saveGuide(raw, { userId = null, userName = '' } = {}) {
  const v = guideInput(raw);
  if (v.error) return { ok: false, status: 400, error: v.error };
  await connectDB();
  const at = new Date();
  await SystemConfig.updateOne(
    { key: GUIDE_KEY },
    { $set: { value: { html: v.html, byName: String(userName || ''), at }, label: 'דף ההנחיות להגהת עמודים', ...(userId ? { lastUpdatedBy: userId } : {}) } },
    { upsert: true }
  );
  revalidateNow(CACHE_TAGS.PAGE_PROOF_GUIDE);
  return { ok: true, html: v.html, at: at.toISOString() };
}

// "חזרה לנוסח המקורי" — הנוסח השמור נמחק
export async function resetGuide() {
  await connectDB();
  const r = await SystemConfig.deleteOne({ key: GUIDE_KEY });
  revalidateNow(CACHE_TAGS.PAGE_PROOF_GUIDE);
  return { ok: true, removed: r.deletedCount || 0 };
}
