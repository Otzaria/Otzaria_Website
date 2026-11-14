import assert from 'node:assert/strict'
import { test } from 'node:test'
import { classifyGhFailure, evaluateAttestationOutput, repoFromUrl } from '../src/attestation.js'
import { COMMIT, SHA, sampleVerifyOutput } from './attestationSample.mjs'

const SOURCES = [{ repository: 'Owner/Service', commit: COMMIT }, { repository: 'owner/plugin', commit: 'f'.repeat(40) }]

test('אישור תקין: מאגר ו-commit שהוגשו, runner של GitHub, נתיב workflow', () => {
  const r = evaluateAttestationOutput(sampleVerifyOutput(), { sha256: SHA, sources: SOURCES })
  assert.equal(r.ok, true)
  assert.equal(r.match.repository, 'Owner/Service')
  assert.equal(r.match.commit, COMMIT)
  assert.equal(r.match.workflowPath, '.github/workflows/release.yml')
})

test('digest שונה, commit אחר, מאגר שלא הוגש, self-hosted — נדחים', () => {
  const expect = { sha256: SHA, sources: SOURCES }
  assert.equal(evaluateAttestationOutput(sampleVerifyOutput({ sha256: 'cd'.repeat(32) }), expect).ok, false)
  assert.equal(evaluateAttestationOutput(sampleVerifyOutput({ commit: 'e'.repeat(40) }), expect).ok, false)
  assert.equal(evaluateAttestationOutput(sampleVerifyOutput({ repo: 'evil/fork' }), expect).ok, false)
  const self = evaluateAttestationOutput(sampleVerifyOutput({ runner: 'self-hosted' }), expect)
  assert.equal(self.ok, false)
  assert.match(self.reasons.join(), /self-hosted/)
  assert.equal(evaluateAttestationOutput(sampleVerifyOutput({ workflowRepo: 'other/repo' }), expect).ok, false)
})

test('פלט ריק או לא JSON', () => {
  assert.equal(evaluateAttestationOutput('[]', { sha256: SHA, sources: SOURCES }).ok, false)
  assert.equal(evaluateAttestationOutput('not json', { sha256: SHA, sources: SOURCES }).ok, false)
})

test('repoFromUrl וסיווג כשלי gh', () => {
  assert.equal(repoFromUrl('git+https://github.com/A/B.git@refs/heads/main'), 'a/b')
  assert.equal(repoFromUrl('https://evil.com/a/b'), null)
  assert.equal(classifyGhFailure('HTTP 401: Bad credentials'), 'operator')
  assert.equal(classifyGhFailure('To get started with GitHub CLI, please run:  gh auth login'), 'operator')
  assert.equal(classifyGhFailure('HTTP 502: Bad Gateway'), 'transient')
  assert.equal(classifyGhFailure('✗ Loading attestations from GitHub API failed\nHTTP 404: Not Found'), 'not_verified')
})
