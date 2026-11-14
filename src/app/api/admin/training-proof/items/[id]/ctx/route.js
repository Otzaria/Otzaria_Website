import { serveAdminImage } from '../../../_lib/image';

// GET — העמוד המלא של שורה ("הצג בעמוד המלא"), כשהתחנה צירפה אותו. רק מנהל OCR.
export async function GET(_request, { params }) {
  return serveAdminImage(params, 'ctxPath');
}
