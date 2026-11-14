import { serveItemImage } from '@/lib/trainingProof/imageRoute';

// GET — העמוד המלא של השורה ("הצג בעמוד המלא"; docs/76 §4.1 ctx)
export async function GET(request, { params }) {
  return serveItemImage(params, 'ctxPath');
}
