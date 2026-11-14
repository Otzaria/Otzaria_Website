export const SHA = 'ab'.repeat(32)
export const COMMIT = '0123456789abcdef0123456789abcdef01234567'

/** מבנה הפלט של `gh attestation verify --format json` (in-toto Statement v1 + SLSA provenance v1). */
export function sampleVerifyOutput({ sha256 = SHA, repo = 'owner/service', commit = COMMIT, runner = 'github-hosted',
  workflowRepo = repo, workflowPath = '.github/workflows/release.yml' } = {}) {
  const ref = 'refs/tags/v1.0.0'
  return JSON.stringify([{
    attestation: { bundle: { mediaType: 'application/vnd.dev.sigstore.bundle.v0.3+json' } },
    verificationResult: {
      mediaType: 'application/vnd.dev.sigstore.verificationresult+json;version=0.1',
      signature: {
        certificate: {
          issuer: 'https://token.actions.githubusercontent.com',
          subjectAlternativeName: `https://github.com/${workflowRepo}/${workflowPath}@${ref}`,
          buildSignerURI: `https://github.com/${workflowRepo}/${workflowPath}@${ref}`,
          runnerEnvironment: runner,
          sourceRepositoryURI: `https://github.com/${repo}`,
          sourceRepositoryDigest: commit,
          sourceRepositoryRef: ref,
          runInvocationURI: `https://github.com/${repo}/actions/runs/1/attempts/1`,
        },
      },
      verifiedTimestamps: [{ type: 'Tlog', uri: 'https://rekor.sigstore.dev', timestamp: '2026-10-01T00:00:00Z' }],
      statement: {
        _type: 'https://in-toto.io/Statement/v1',
        subject: [{ name: 'setup.exe', digest: { sha256 } }],
        predicateType: 'https://slsa.dev/provenance/v1',
        predicate: {
          buildDefinition: {
            buildType: 'https://actions.github.io/buildtypes/workflow/v1',
            externalParameters: { workflow: { ref, repository: `https://github.com/${workflowRepo}`, path: workflowPath } },
            internalParameters: { github: { event_name: 'push', runner_environment: runner } },
            resolvedDependencies: [{ uri: `git+https://github.com/${repo}@${ref}`, digest: { gitCommit: commit } }],
          },
          runDetails: { builder: { id: `https://github.com/${workflowRepo}/${workflowPath}@${ref}` }, metadata: {} },
        },
      },
    },
  }])
}
