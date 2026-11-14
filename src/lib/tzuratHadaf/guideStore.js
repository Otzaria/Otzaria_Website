import { unstable_cache } from 'next/cache';
import connectDB from '@/lib/db';
import SystemConfig from '@/models/SystemConfig';
import { CACHE_TAGS, revalidateNow } from '@/lib/cacheTags';
import { GUIDE_KEY, guideInput } from './guideContent.js';

// צורת הדף — דף ההנחיות: הנוסח שנשמר בדף הניהול (SystemConfig 'tzurat_hadaf_guide': {html, byName, at}). אותו דפוס
// כמו lib/pageProof/guideStore.js: הדף הציבורי קורא דרך מטמון עם תגית, וכל שמירה מבטלת אותו מיד (revalidateNow).

async function readGuide() {
  await connectDB();
  const doc = await SystemConfig.findOne({ key: GUIDE_KEY }, { value: 1, updatedAt: 1 }).lean();
  const v = doc?.value;
  if (!v || typeof v.html !== 'string' || !v.html) return null;
  return { html: v.html, byName: String(v.byName || ''), at: v.at ? new Date(v.at).toISOString() : doc.updatedAt ? new Date(doc.updatedAt).toISOString() : null };
}

const cachedGuide = unstable_cache(readGuide, ['tzurat-hadaf-guide'], { tags: [CACHE_TAGS.TZURAT_GUIDE], revalidate: 3600 });

// הנוסח השמור, או null (← הנוסח המקורי). כשל במסד — null: הדף הציבורי נשאר זמין
export async function loadGuide() {
  try {
    return await cachedGuide();
  } catch (e) {
    console.error('tzurat guide load', e?.name);
    return null;
  }
}

export const loadGuideFresh = readGuide;

export async function saveGuide(raw, { userId = null, userName = '' } = {}) {
  const v = guideInput(raw);
  if (v.error) return { ok: false, status: 400, error: v.error };
  await connectDB();
  const at = new Date();
  await SystemConfig.updateOne(
    { key: GUIDE_KEY },
    { $set: { value: { html: v.html, byName: String(userName || ''), at }, label: 'דף ההנחיות של צורת הדף', ...(userId ? { lastUpdatedBy: userId } : {}) } },
    { upsert: true }
  );
  revalidateNow(CACHE_TAGS.TZURAT_GUIDE);
  return { ok: true, html: v.html, at: at.toISOString() };
}

export async function resetGuide() {
  await connectDB();
  const r = await SystemConfig.deleteOne({ key: GUIDE_KEY });
  revalidateNow(CACHE_TAGS.TZURAT_GUIDE);
  return { ok: true, removed: r.deletedCount || 0 };
}
