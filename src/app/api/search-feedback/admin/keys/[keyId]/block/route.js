import { handleKeyStatusChange } from '@/lib/search-feedback/key-status-route';

export const dynamic = 'force-dynamic';

// POST /api/search-feedback/admin/keys/[keyId]/block
export async function POST(_request, { params }) {
  return handleKeyStatusChange(params, 'blocked');
}
