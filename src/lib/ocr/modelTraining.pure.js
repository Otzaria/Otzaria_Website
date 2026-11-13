export const TRAINING_LIMITS = Object.freeze({ pages: 100, lines: 5000, bytes: 256 * 1024 * 1024 });

export function trainingRequest(body) {
  if (!body || !/^[a-f0-9]{24}$/.test(body.bookId) || !/^[a-zA-Z0-9_-]{16,64}$/.test(body.requestId)
    || !['square', 'rashi'].includes(body.script) || !Number.isInteger(body.epochs) || body.epochs < 1 || body.epochs > 20
    || !Array.isArray(body.pageNumbers) || body.pageNumbers.length !== 5
    || body.pageNumbers.some(n => !Number.isSafeInteger(n) || n < 1) || new Set(body.pageNumbers).size !== 5
    || body.approved !== true) return null;
  return { bookId: body.bookId, requestId: body.requestId, script: body.script, epochs: body.epochs,
    pageNumbers: [...body.pageNumbers].sort((a, b) => a - b), approved: true };
}

export function trainingResultProblem(doc, job) {
  if (doc.pages?.some(p => p.text !== '' || p.layout != null)) return 'training must not contain OCR output';
  if (doc.outcome !== 'success') return null;
  const t = doc.metadata?.training;
  if (job?.trainingOptions?.bookId && t?.bookId !== job.trainingOptions.bookId) return 'training book scope mismatch';
  if (t?.stage !== 'completed' || t.activated !== true || !t.metrics
    || !Number.isFinite(t.metrics.baselineAccuracy) || !Number.isFinite(t.metrics.candidateAccuracy)
    || t.metrics.baselineAccuracy < 0 || t.metrics.baselineAccuracy > 100
    || t.metrics.candidateAccuracy < 0 || t.metrics.candidateAccuracy > 100
    || t.metrics.candidateAccuracy < t.metrics.baselineAccuracy) return 'training was not activated';
  for (const key of ['before', 'after']) {
    const r = t[key];
    if (!r || !/^[a-f0-9]{64}$/.test(r.sha256) || !/^[a-f0-9]{64}$/.test(r.archiveSha256)
      || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(r.repo)
      || !/^[A-Za-z0-9_.-]+$/.test(r.tag)
      || r.url !== `https://github.com/${r.repo}/releases/tag/${r.tag}`) return 'training release missing';
  }
  return null;
}

export function trainingReleaseLink(release) {
  if (!release || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(release.repo)
    || !/^[A-Za-z0-9_.-]+$/.test(release.tag)
    || release.url !== `https://github.com/${release.repo}/releases/tag/${release.tag}`) return null;
  return { url: release.url, tag: release.tag };
}
