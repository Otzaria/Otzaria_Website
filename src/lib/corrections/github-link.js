/**
 * קישור לקובץ הספר בגיטהאב, ממוקד בשורה כשידועה (#L…) — לאיתור ידני כשהשורה לא אותרה בוודאות.
 * כל מקטע בנתיב מקודד בנפרד (שמות עבריים, רווחים); ה-`/` נשארים.
 * @param {{repo:string, ref:string, path:string, lineIndex?:(number|null)}} args
 * @returns {string|null}
 */
export function githubFileUrl({ repo, ref, path, lineIndex = null }) {
  if (!repo || !ref || !path) return null;
  const encodedPath = path.split('/').map(encodeURIComponent).join('/');
  const anchor = Number.isSafeInteger(lineIndex) && lineIndex >= 0 ? `#L${lineIndex + 1}` : '';
  return `https://github.com/${repo}/blob/${encodeURIComponent(ref)}/${encodedPath}${anchor}`;
}
