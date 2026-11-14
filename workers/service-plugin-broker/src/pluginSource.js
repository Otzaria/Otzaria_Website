import { readFile } from 'node:fs/promises'
import { readPluginZipEntry, readPluginZipDirectory } from '../../../src/lib/pluginArchive.js'
import { SourceFormatError } from './source.js'
import { sha256, throwIfAborted } from './util.js'

// אותו קורא ZIP מוגבל שמשמש את האתר; אין חילוץ לנתיבים או הפעלת תוכן מההגשה.
export async function collectUploadedPlugin(ctx, collector) {
  await ctx.ensureAssets()
  const asset = ctx.assetList().find((a) => a.isPlugin)
  const buffer = await readFile(ctx.localPath(asset))
  let directory
  try {
    directory = readPluginZipDirectory(buffer)
  } catch {
    throw new SourceFormatError('קובץ התוסף שהועלה אינו ארכיון ZIP תקין בגבולות הגודל המותרים')
  }
  for (const entry of directory.entries.values()) {
    throwIfAborted(ctx.signal)
    if (entry.name.endsWith('/')) continue
    let content
    try {
      content = readPluginZipEntry(directory, entry)
    } catch {
      throw new SourceFormatError('לא ניתן לקרוא ולאמת את תוכן קובץ התוסף שהועלה')
    }
    await collector.add('uploaded-plugin', { path: `plugin/${entry.name}`, type: 'file', size: content.length,
      content, sha256: sha256(content) }, 'plugin')
  }
}
