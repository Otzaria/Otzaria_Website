import { compareVersions } from './semverCompare.js'
import { runPluginValidationJob } from './pluginValidationRunner.js'

export { compareVersions }

// Even manifest-only reads are isolated: a hostile ZIP/JSON must not block Next.
export async function readManifestFromPlugin(buffer) {
  return runPluginValidationJob('manifest', buffer)
}
