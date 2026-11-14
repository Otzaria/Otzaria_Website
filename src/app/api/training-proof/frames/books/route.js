import { listBooks } from '../_lib/framesDb';
import { gate, fromResult, serverError } from '../_lib/http';

// GET /api/training-proof/frames/books — רשימת הספרים של גלאי האזורים, עם המצב של כל ספר למי שמסתכל:
// free · mine · taken (who) · partial (worked, workedBy) · done.
// ← {success, books:[{book, alias, kind, pages, done, draft, state, claimedUntil, who, worked, workedBy}]}
export async function GET() {
  const { gate: g, res } = await gate();
  if (res) return res;
  try {
    return fromResult(await listBooks(g.userId));
  } catch (e) {
    return serverError('books GET', e);
  }
}
