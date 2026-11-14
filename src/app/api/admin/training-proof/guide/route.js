import TrainingProofGuide from '@/models/TrainingProofGuide';
import { SECTIONS } from '@/lib/trainingProof/vocab';
import { adminGate, ok, fail, jsonBody, sectionOf, oid, crash } from '../_lib/http';
import { namesOf } from '../_lib/review';

// הוראות-ההגהה לכל חלק (docs/75 §2; docs/76 §8.1). Markdown — המתנדב רואה אותן בכפתור
// "הוראות". אין כאן HTML גולמי: התצוגה (בניהול ואצל המתנדב) מציגה Markdown בלבד.
// GET ← {guides:{ocr:{markdown, updatedAt, by}, router:{…}, frames:{…}}}
// PUT {section, markdown} ← {updatedAt}
const MAX = 100000;

export async function GET() {
  const { error } = await adminGate();
  if (error) return error;
  try {
    const docs = await TrainingProofGuide.find({}).lean();
    const names = await namesOf(docs.map((d) => d.updatedBy));
    const guides = Object.fromEntries(
      SECTIONS.map((s) => {
        const d = docs.find((x) => x.section === s);
        return [s, d ? { markdown: d.markdown || '', updatedAt: d.updatedAt, by: d.updatedBy ? names.get(String(d.updatedBy)) || '' : '' } : null];
      })
    );
    return ok({ guides });
  } catch (e) {
    return crash('guide', e);
  }
}

export async function PUT(request) {
  const { userId, error } = await adminGate();
  if (error) return error;
  const { body, error: bad } = await jsonBody(request, MAX * 4 + 4096);
  if (bad) return bad;
  const section = sectionOf(body.section);
  if (!section) return fail(400, 'חלק לא מוכר');
  if (typeof body.markdown !== 'string') return fail(400, 'חסר הטקסט');
  const markdown = body.markdown.replace(/\r\n/g, '\n');
  if (markdown.length > MAX) return fail(400, 'ההוראות ארוכות מדי');
  try {
    const updatedAt = new Date();
    await TrainingProofGuide.updateOne(
      { section },
      { $set: { markdown, updatedAt, updatedBy: oid(userId) }, $setOnInsert: { section } },
      { upsert: true }
    );
    return ok({ updatedAt });
  } catch (e) {
    return crash('guide save', e, 'השמירה נכשלה');
  }
}
