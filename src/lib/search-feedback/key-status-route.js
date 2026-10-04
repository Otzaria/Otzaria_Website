/**
 * גוף משותף לנתיבי block/unblock של מפתח.
 */
import { requireSearchFeedbackAccess, jsonNoStore } from './route-auth.js';
import { setKeyStatus } from './service.js';
import { KEY_ID_RE } from './crypto.js';

export async function handleKeyStatusChange(params, status) {
  const auth = await requireSearchFeedbackAccess();
  if (!auth.ok) return auth.response;
  const { keyId } = await params;
  if (typeof keyId !== 'string' || !KEY_ID_RE.test(keyId)) return jsonNoStore({ error: 'ההתקנה לא נמצאה' }, 404);
  try {
    const key = await setKeyStatus(keyId, status);
    if (!key) return jsonNoStore({ error: 'ההתקנה לא נמצאה' }, 404);
    return jsonNoStore({ success: true, ...key });
  } catch (error) {
    console.error('Search feedback key status failed:', error?.message);
    return jsonNoStore({ error: 'עדכון ההתקנה נכשל' }, 500);
  }
}
