import { after } from 'next/server';
import { withCorrections } from '../../../_shared';
import { readJson } from '@/lib/corrections/http';
import { runReportAction } from '@/lib/corrections/actions';
import { sendCorrectionApprovedThanks } from '@/lib/emailService';

export const dynamic = 'force-dynamic';

export async function POST(request, { params }) {
  const { id } = await params;
  return withCorrections(request, async ({ user, config }) => {
    let body;
    try {
      body = await readJson(request);
    } catch (e) {
      return { status: e.status || 400, body: { error: 'invalid_json' } };
    }
    return runReportAction({ user, id, body, config, deps: { schedule: (work) => after(work), sendThanksMail: sendCorrectionApprovedThanks } });
  }, { mutate: true });
}
