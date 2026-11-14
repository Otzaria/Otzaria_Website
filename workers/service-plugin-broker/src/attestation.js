// אימות אישורי בנייה: פענוח הפלט של `gh attestation verify --format json` ובדיקתו מול ההגשה.

const SLSA_V1 = 'https://slsa.dev/provenance/v1'

/** https://github.com/OWNER/REPO(.git) או git+https://github.com/OWNER/REPO@ref → owner/repo באותיות קטנות */
export function repoFromUrl(value) {
  if (typeof value !== 'string') return null
  const m = /^(?:git\+)?https:\/\/github\.com\/([A-Za-z0-9-]{1,39})\/([A-Za-z0-9._-]{1,100})(?:@|$)/.exec(value)
  if (!m) return null
  return `${m[1]}/${m[2].replace(/\.git$/, '')}`.toLowerCase()
}

/**
 * בודק רשומה אחת מהפלט מול ה-sha256 והמקורות שהוגשו.
 * @returns {{ok:true, match:object}|{ok:false, reason:string}}
 */
export function evaluateEntry(entry, { sha256, sources }) {
  const vr = entry?.verificationResult
  const stmt = vr?.statement
  if (!stmt || typeof stmt !== 'object') return { ok: false, reason: 'אישור ללא statement' }
  if (typeof stmt.predicateType !== 'string' || !stmt.predicateType.startsWith(SLSA_V1)) {
    return { ok: false, reason: 'סוג האישור אינו SLSA provenance v1' }
  }
  const subjects = Array.isArray(stmt.subject) ? stmt.subject : []
  if (!subjects.some((s) => typeof s?.digest?.sha256 === 'string' && s.digest.sha256.toLowerCase() === sha256)) {
    return { ok: false, reason: 'ה-digest באישור אינו תואם לקובץ שהוגש' }
  }
  const bd = stmt.predicate?.buildDefinition ?? {}
  const workflow = bd.externalParameters?.workflow ?? {}
  const cert = vr.signature?.certificate ?? {}

  const runners = [bd.internalParameters?.github?.runner_environment, cert.runnerEnvironment].filter((v) => v !== undefined && v !== null)
  if (!runners.length) return { ok: false, reason: 'האישור אינו מציין את סוג ה-runner' }
  if (!runners.every((r) => r === 'github-hosted')) return { ok: false, reason: 'הקובץ נבנה על runner מסוג self-hosted' }

  const deps = Array.isArray(bd.resolvedDependencies) ? bd.resolvedDependencies : []
  const claims = deps
    .map((d) => ({ repo: repoFromUrl(d?.uri), commit: typeof d?.digest?.gitCommit === 'string' ? d.digest.gitCommit.toLowerCase() : null }))
    .filter((c) => c.repo && c.commit)
  const certRepo = repoFromUrl(cert.sourceRepositoryURI)
  if (certRepo && typeof cert.sourceRepositoryDigest === 'string') {
    claims.push({ repo: certRepo, commit: cert.sourceRepositoryDigest.toLowerCase() })
  }
  if (!claims.length) return { ok: false, reason: 'האישור אינו מציין מאגר ו-commit מקור' }

  const workflowRepo = repoFromUrl(workflow.repository)
  const submitted = sources.map((s) => ({ repo: s.repository.toLowerCase(), commit: s.commit.toLowerCase(), original: s }))
  for (const claim of claims) {
    const src = submitted.find((s) => s.repo === claim.repo && s.commit === claim.commit)
    if (!src) continue
    // כל ה-commit-ים שבאישור חייבים להיות זהים — אחרת לא ברור מאיזה קוד נבנה הקובץ.
    if (claims.some((c) => c.repo === claim.repo && c.commit !== claim.commit)) {
      return { ok: false, reason: 'האישור מציין כמה commit-ים שונים לאותו מאגר' }
    }
    if (workflowRepo && workflowRepo !== src.repo) {
      return { ok: false, reason: 'ה-workflow שבנה את הקובץ אינו שייך למאגר המקור שהוגש' }
    }
    const workflowPath = typeof workflow.path === 'string' ? workflow.path : null
    if (!workflowPath) return { ok: false, reason: 'האישור אינו מציין את נתיב ה-workflow' }
    return {
      ok: true,
      match: {
        repository: src.original.repository,
        commit: src.original.commit,
        workflowPath,
        workflowRef: typeof workflow.ref === 'string' ? workflow.ref : null,
        signerWorkflow: typeof cert.buildSignerURI === 'string' ? cert.buildSignerURI : null,
        runnerEnvironment: 'github-hosted',
        invocation: typeof cert.runInvocationURI === 'string' ? cert.runInvocationURI : null,
      },
    }
  }
  return { ok: false, reason: 'האישור מצביע על מאגר או commit שלא הוגשו' }
}

/**
 * @param {string} stdout פלט JSON של gh
 * @returns {{ok:true, match:object}|{ok:false, reasons:string[]}}
 */
export function evaluateAttestationOutput(stdout, expected) {
  let parsed
  try {
    parsed = JSON.parse(stdout)
  } catch {
    return { ok: false, reasons: ['פלט האימות אינו JSON תקין'] }
  }
  const list = Array.isArray(parsed) ? parsed : []
  if (!list.length) return { ok: false, reasons: ['לא נמצא אישור בנייה מאומת'] }
  const reasons = []
  for (const entry of list) {
    const r = evaluateEntry(entry, expected)
    if (r.ok) return r
    reasons.push(r.reason)
  }
  return { ok: false, reasons: [...new Set(reasons)] }
}

/** סיווג כשל של gh לפי stderr של gh עצמו (לא פלט מודל). */
export function classifyGhFailure(stderr) {
  const s = String(stderr ?? '')
  if (/HTTP 401|bad credentials|gh auth login|authentication required|not logged in|GH_TOKEN/i.test(s)) return 'operator'
  if (/HTTP 5\d\d|HTTP 429|rate limit|timeout|timed out|connection|ECONNRESET|ENOTFOUND|EAI_AGAIN|TLS handshake/i.test(s)) {
    return 'transient'
  }
  return 'not_verified'
}
