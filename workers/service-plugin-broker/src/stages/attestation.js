import { parseReleaseUrl } from '../policy.js'
import { Rejection, operator, transient } from '../errors.js'
import { classifyGhFailure, evaluateAttestationOutput } from '../attestation.js'

const GH_TIMEOUT_MS = 5 * 60_000

/** מאגר ה-Release קודם, ואחריו שאר המקורות. */
function candidateRepos(asset, sources) {
  const rel = parseReleaseUrl(asset.releaseUrl)
  const relRepo = rel ? `${rel.owner}/${rel.repo}`.toLowerCase() : null
  return [...sources].sort((a, b) => Number(b.repository.toLowerCase() === relRepo) - Number(a.repository.toLowerCase() === relRepo))
}

export async function attestationStage(ctx) {
  await ctx.ensureAssets()
  const sources = ctx.job.submission.sources
  const verified = []
  for (const asset of ctx.job.assets) {
    const reasons = []
    let match = null
    for (const src of candidateRepos(asset, sources)) {
      const args = ['attestation', 'verify', '--repo', src.repository, '--format', 'json', '--deny-self-hosted-runners', '--',
        ctx.localPath(asset)]
      const r = await ctx.exec(ctx.config.gh, args, {
        timeoutMs: GH_TIMEOUT_MS,
        env: { GH_TOKEN: ctx.config.ghToken, HOME: ctx.config.home, GH_NO_UPDATE_NOTIFIER: '1', GH_PROMPT_DISABLED: '1',
          NO_COLOR: '1', GH_SPINNER_DISABLED: '1' },
      })
      if (r.spawnError) throw operator('gh_unavailable', 'GitHub CLI (gh) אינו מותקן או אינו זמין בשרת הבדיקה')
      if (r.timedOut) throw transient('gh_timeout', 'אימות אישור הבנייה חרג מזמן ההמתנה')
      if (r.aborted) throw transient('gh_aborted', 'אימות אישור הבנייה נעצר')
      if (r.code !== 0) {
        const kind = classifyGhFailure(r.stderr)
        if (kind === 'operator') throw operator('gh_auth', 'GitHub CLI אינו מחובר (GH_TOKEN) — נדרש טיפול של אחראי השרת')
        if (kind === 'transient') throw transient('gh_network', 'אימות אישור הבנייה נכשל זמנית מול GitHub')
        reasons.push(`${src.repository}: לא נמצא אישור בנייה תקף`)
        continue
      }
      const ev = evaluateAttestationOutput(r.stdout, { sha256: asset.sha256, sources })
      if (ev.ok) {
        match = ev.match
        break
      }
      reasons.push(...ev.reasons.map((x) => `${src.repository}: ${x}`))
    }
    if (!match) {
      throw new Rejection('attestation',
        `לא נמצא אישור בנייה (GitHub build provenance) תקף למתקין ${asset.name}, מתוך אחד המאגרים וה-commit שהוגשו ועל runner של GitHub.\n` +
        [...new Set(reasons)].map((x) => `- ${x}`).join('\n'), { key: asset.key })
    }
    verified.push({ key: asset.key, assetName: asset.name, ...match })
  }
  return { status: 'verified', verified }
}
