// Web Worker: ניתוח פרופיל ההקרנה של צילום העמוד מחוץ ל-main thread (P1-7). מקבל ImageBitmap
// מוקטן (createImageBitmap עם resize — כבר בגודל הניתוח), מצייר ל-OffscreenCanvas ומחזיר את
// הפרופיל. נטען מ-src/hooks/useScanLines.js דרך new URL('…', import.meta.url).
import { profileFromRgba } from './scanProfile.js';

self.onmessage = (e) => {
  const { id, bitmap, w } = e.data || {};
  try {
    const dw = bitmap.width;
    const dh = bitmap.height;
    const canvas = new OffscreenCanvas(dw, dh);
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('no 2d context');
    ctx.drawImage(bitmap, 0, 0);
    bitmap.close?.();
    const data = ctx.getImageData(0, 0, dw, dh);
    self.postMessage({ id, profile: profileFromRgba(data.data, dw, dh, { scale: dw / w }) });
  } catch (err) {
    self.postMessage({ id, profile: null, error: String(err?.message || err) });
  }
};
