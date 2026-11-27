/**
 * הסבר אוטומטי של מודל שפה (volunteer_explanation, חוזה B §3.2): סניטציה וקליטה בתשובת השירות.
 * תצוגה בלבד — לעולם לא שגיאה ולא משפיע על ההחלטה.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeChangeDigest } from './ocj1.js';
import { validateVerifyResponse, sanitizeVolunteerExplanation, MAX_EXPLANATION_TEXT, MAX_EXPLANATION_MODEL, MAX_EXPLANATION_NOTE } from './verify-protocol.js';

const NOTE = 'הסבר אוטומטי של מודל שפה; אינו החלטה ואינו ראיה.';
const good = (over = {}) => ({ text: 'המילה בנוסח הקיים כתובה כך גם בעדי הנוסח האחרים.', source: 'llm', model: 'qwen3-8b', note: NOTE, ...over });

test('הסבר תקין נשמר כמו שהוא (text, model, note בלבד)', () => {
  assert.deepEqual(sanitizeVolunteerExplanation({ ...good(), extra: 'x' }), { text: good().text, model: 'qwen3-8b', note: NOTE });
});

test('חסר / לא אובייקט / source שאינו llm / טקסט ריק או לא מחרוזת → null, בלי חריגה', () => {
  for (const v of [undefined, null, 'טקסט', 5, [], [good()], good({ source: 'human' }), good({ source: undefined }), good({ text: '' }),
    good({ text: '   \n\t ' }), good({ text: 7 }), good({ text: undefined }), good({ text: '\u0000\u200F\u202E' })]) {
    assert.equal(sanitizeVolunteerExplanation(v), null);
  }
});

test('תווי בקרה ותווי כיוון נמחקים; רווחים מכווצים', () => {
  const out = sanitizeVolunteerExplanation(good({ text: 'שורה\u0000 אחת\r\nשנייה\u202Eסוף\u200F', model: 'm\u0007odel', note: '\u001bהערה\u0085קבועה' }));
  assert.equal(out.text, 'שורה אחת שנייה סוף');
  assert.equal(out.model, 'm odel');
  assert.equal(out.note, 'הערה קבועה');
  assert.doesNotMatch(JSON.stringify(out), /[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u202A-\u202E]/);
});

test('תקרות: text 600, model 80, note 200', () => {
  const out = sanitizeVolunteerExplanation(good({ text: 'א'.repeat(2000), model: 'm'.repeat(500), note: 'ב'.repeat(900) }));
  assert.equal(out.text.length, MAX_EXPLANATION_TEXT);
  assert.equal(out.model.length, MAX_EXPLANATION_MODEL);
  assert.equal(out.note.length, MAX_EXPLANATION_NOTE);
  assert.deepEqual([MAX_EXPLANATION_TEXT, MAX_EXPLANATION_MODEL, MAX_EXPLANATION_NOTE], [600, 80, 200]);
});

test('model או note חסרים או לא מחרוזת → null, וההסבר עצמו נשמר', () => {
  assert.deepEqual(sanitizeVolunteerExplanation(good({ model: 3, note: {} })), { text: good().text, model: null, note: null });
  assert.deepEqual(sanitizeVolunteerExplanation({ text: 'הסבר', source: 'llm' }), { text: 'הסבר', model: null, note: null });
});

const REQ = { request_id: 'req_1', report_id: 'rep1', proposal_revision: 1 };
function resp(over = {}) {
  const c = { path: 'a/b.txt', base_blob_sha: 'a'.repeat(40), line_index: 2, original_line: 'ישן', new_line: 'חדש' };
  return {
    api_version: '1', request_id: 'req_1', report_id: 'rep1', proposal_revision: 1, workflow_generation: 3, decision_id: 'dec_1',
    processing_status: 'completed', decision: 'approved', approval_scope: 'technical_only', reason_code: 'ok', message: 'ok',
    change: {
      change_id: 'chg_s1', change_digest: computeChangeDigest(c), target: { repo: 'Otzaria/otzaria-library', path: c.path, line_index: c.line_index },
      base: { commit_sha: 'b'.repeat(40), blob_sha: c.base_blob_sha }, original_line: c.original_line, new_line: c.new_line,
    }, ...over,
  };
}
const vctx = () => ({ request: REQ, currentGeneration: 3, siteAuthority: 'technical_and_content' });

test('קליטת תשובה: ההסבר נשמר ב-value, והחלטה, סיבה, נימוק וראיות זהים לתשובה בלעדיו', () => {
  const withIt = validateVerifyResponse(resp({ volunteer_explanation: good() }), vctx());
  const without = validateVerifyResponse(resp(), vctx());
  assert.equal(withIt.ok, true);
  assert.deepEqual(withIt.value.volunteerExplanation, { text: good().text, model: 'qwen3-8b', note: NOTE });
  assert.equal(without.value.volunteerExplanation, null);
  const { volunteerExplanation: _a, ...restWith } = withIt.value;
  const { volunteerExplanation: _b, ...restWithout } = without.value;
  assert.deepEqual(restWith, restWithout);
  assert.equal(withIt.stale, without.stale);
});

test('קליטת תשובה: הסבר פגום מכל סוג אינו שגיאה ואינו משנה את התוצאה', () => {
  for (const bad of [null, 'טקסט', 42, [], {}, { text: 'x', source: 'rule' }, { text: '', source: 'llm' }, { text: { a: 1 }, source: 'llm' }]) {
    const v = validateVerifyResponse(resp({ volunteer_explanation: bad }), vctx());
    assert.equal(v.ok, true);
    assert.equal(v.kind, 'decision');
    assert.equal(v.value.decision, 'approved');
    assert.equal(v.value.volunteerExplanation, null);
  }
});
