import { handlePurgeRequest } from '@/lib/search-feedback/purge-route';

export const dynamic = 'force-dynamic';

// POST /api/search-feedback/admin/purge[?dryRun=1]
// גוף: { from?, to?, type?, modelFamilyId?, modelQuantization?(null=בלי), keyId?, all? , asOf?, confirmCount? }
export async function POST(request) {
  return handlePurgeRequest(request);
}
