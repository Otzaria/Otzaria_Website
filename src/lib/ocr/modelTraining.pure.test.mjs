import { test } from 'node:test';
import assert from 'node:assert/strict';
import { trainingRequest, trainingResultProblem } from './modelTraining.pure.js';
import { validateResult } from './localResultValidate.js';
import { toEnvelope } from './localEnvelope.js';
import { parseJobFileName, fileDecision } from './localCleanup.pure.js';

const id = 'a'.repeat(24), hash = 'b'.repeat(64);
const req = { bookId: id, requestId: 'request-training-1', script: 'square', epochs: 4, pageNumbers: [1,2,3,4,5], approved: true };
const release = { repo: 'owner/models', tag: 'trained-a', sha256: hash, archiveSha256: hash,
  url: 'https://github.com/owner/models/releases/tag/trained-a' };
const receipt = { bookId: id, stage: 'completed', activated: true, before: release, after: release,
  metrics: { baselineAccuracy: 98, candidateAccuracy: 99 } };
const job = { _id: id, taskType: 'training', inputSha256: hash, workerId: 'worker-1',
  createdAt: new Date(0), trainingOptions: { script: 'rashi', epochs: 3, bookId: id },
  pageMap: [{ pdfPageIndex: 1, page: id, pageNumber: 1, expectedUpdatedAt: new Date(0), imageSha256: hash }] };
const doc = { schemaVersion: 1, jobId: id, inputSha256: hash, outcome: 'success',
  pipelineVersion: 'ocr-torani training-v1', pages: [{ pdfPageIndex: 1, text: '' }], metadata: { training: receipt } };

test('bounded training selection, no command or private-user input can change the envelope', () => {
  assert.deepEqual(trainingRequest(req).pageNumbers, [1,2,3,4,5]);
  for (const over of [{ epochs: 21 }, { epochs: '4' }, { script: 'latin' }, { approved: false },
    { pageNumbers: [1,2,3,4] }, { pageNumbers: [1,1,2,3,4] }, { bookId: '../x' }]) {
    assert.equal(trainingRequest({ ...req, ...over }), null);
  }
  assert.deepEqual(toEnvelope(job).options, { script: 'rashi', epochs: 3, bookId: id });
  assert.equal(toEnvelope(job).taskType, 'training');
});

test('training acceptance requires archived models, activation and a non-regression', () => {
  assert.equal(trainingResultProblem(doc), null);
  assert.equal(validateResult(doc, job, 1000).ok, true);
  for (const changed of [
    { ...doc, pages: [{ pdfPageIndex: 1, text: 'MUST NEVER OVERWRITE BOOK' }] },
    { ...doc, pages: [{ pdfPageIndex: 1, text: '', layout: {} }] },
    { ...doc, metadata: {} },
    { ...doc, metadata: { training: { ...receipt, activated: false } } },
    { ...doc, metadata: { training: { ...receipt, metrics: { baselineAccuracy: 99, candidateAccuracy: 90 } } } },
    { ...doc, metadata: { training: { ...receipt, after: { ...release, url: 'javascript:alert(1)' } } } },
  ]) assert.equal(validateResult(changed, job, 1000).ok, false);
});

test('training bundles use existing post-ack retention and are never deleted during training', () => {
  const filename = `training-${hash}.zip`;
  assert.deepEqual(parseJobFileName(filename), { kind: 'input', sha: hash });
  assert.equal(fileDecision({ name: filename }, { ack: { ack: 'accepted' } }, new Date()).action, 'delete');
  assert.equal(fileDecision({ name: `training-${hash}.pdf` }, {}, new Date()).action, 'keep');
});

test('failed training metadata cannot supply an arbitrary link to the admin screen', async () => {
  const { trainingReleaseLink } = await import('./modelTraining.pure.js');
  assert.equal(trainingReleaseLink({ repo: 'owner/models', tag: 'x', url: 'javascript:bad' }), null);
  assert.deepEqual(trainingReleaseLink(release), { url: release.url, tag: release.tag });
});
