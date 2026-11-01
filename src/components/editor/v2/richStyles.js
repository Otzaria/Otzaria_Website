// ה-CSS של התצוגה המעוצבת (RichTextArea) — מחרוזות טהורות. העיצוב של התגים המוכרים, השבבים
// (תגים לא מוכרים / ישויות — התווית ב-::before, כדי שלא תהיה חלק מהטקסט), מספרי השורות
// (מונה CSS), ה-placeholder, ושמות ה-Custom Highlight של סימון המילה והמילים החשודות.

import { MIRROR_GUTTER_PX, MIRROR_HIGHLIGHT } from './TextMirror'

// הרווח בין פסקאות: margin בין שורות לוגיות (.rt-line) לפי --editor-para-gap (editorStyleVars). המדידות
// (עימוד ספר, הסמן, מעקב הצילום) כולן יחסיות לשורה עצמה, כך שה-margin לא מזיז אותן.
export const RICH_BASE_CSS = `
[data-rich-textarea]{position:relative;outline:none;overflow:auto;counter-reset:rtline;caret-color:var(--color-on-surface)}
[data-editor-shell] .editor-container [data-rich-textarea]{line-height:var(--editor-text-line-height,1.625)}
[data-rich-textarea] .rt-line{position:relative;counter-increment:rtline;min-height:1lh}
[data-editor-shell] .editor-container [data-rich-textarea] .rt-line+.rt-line{margin-top:var(--editor-para-gap,0)}
[data-rich-textarea] .rt-b{font-weight:700}
[data-rich-textarea] .rt-i{font-style:italic}
[data-rich-textarea] .rt-u{text-decoration:underline}
[data-rich-textarea] .rt-s{text-decoration:line-through}
[data-rich-textarea] .rt-h1{font-size:1.6em;font-weight:700}
[data-rich-textarea] .rt-h2{font-size:1.4em;font-weight:700}
[data-rich-textarea] .rt-h3{font-size:1.2em;font-weight:700}
[data-rich-textarea] .rt-h4{font-size:1.1em;font-weight:700}
[data-rich-textarea] .rt-big{font-size:1.25em}
[data-rich-textarea] .rt-small{font-size:.8em}
[data-rich-textarea] .rt-sup{vertical-align:super;font-size:.75em}
[data-rich-textarea] .rt-sub{vertical-align:sub;font-size:.75em}
[data-rich-textarea] .rt-chip::before{content:attr(data-label)}
[data-rich-textarea] .rt-chip-tag,[data-rich-textarea] .rt-chip-img{display:inline-block;direction:ltr;unicode-bidi:isolate;font:600 11px/1.6 ui-monospace,monospace;padding:0 4px;margin:0 1px;border-radius:4px;vertical-align:middle;background:var(--color-surface-container-high);color:var(--color-on-surface-variant);user-select:none}
[data-rich-textarea] .rt-chip-img{font-family:var(--font-sans,sans-serif)}
[data-rich-textarea] .rt-chip-entity{text-decoration:underline dotted var(--color-outline)}
[data-rich-textarea][data-empty]::before{content:attr(data-placeholder);position:absolute;pointer-events:none;color:var(--color-outline)}
[data-rich-textarea][data-book] .rt-line{display:flow-root}
[data-rich-textarea] .rt-bk{display:block;pointer-events:none;user-select:none}
[data-rich-textarea] .rt-line[data-bk-tail]{text-align-last:center}
[data-rich-textarea] .rt-line[data-current]{background:var(--rt-band)}
[data-rich-textarea] .rt-line[data-current][data-multi]{background:var(--rt-multi)}
[data-rich-textarea][data-numbers] .rt-line::before{content:counter(rtline);position:absolute;inset-inline-start:${-MIRROR_GUTTER_PX + 6}px;width:${MIRROR_GUTTER_PX - 16}px;text-align:center;font:600 11px/20px var(--font-sans,sans-serif);font-variant-numeric:tabular-nums;white-space:nowrap;color:var(--color-outline);top:calc((1lh - 20px) / 2);user-select:none}
[data-rich-textarea][data-numbers] .rt-line[data-current]::before{color:var(--color-on-primary);background:var(--color-primary);border-radius:999px}
`

/** שם Custom Highlight חוקי ויחיד לשדה (לפי הטור) */
export const highlightName = (kind, column) => `rt-${kind}-${String(column || 'content').replace(/[^a-z0-9-]/gi, '')}`

/**
 * חוקי ::highlight לשדה אחד: המילה הנוכחית (רגילה/משוערת) והמילים החשודות — באותן עוצמות של
 * שכבת ה-mirror של ה-textarea (MIRROR_HIGHLIGHT).
 * @param {string} column
 * @param {'strong'|'normal'} strength
 */
export function highlightCss(column, strength) {
  const hl = MIRROR_HIGHLIGHT[strength] || MIRROR_HIGHLIGHT.strong
  const bg = hl.word ? `background-color:${hl.word};` : ''
  const word = (style) => `${bg}text-decoration:underline ${style} var(--color-primary) ${hl.underline};text-underline-offset:.3em;`
  return [
    `::highlight(${highlightName('word', column)}){${word('solid')}}`,
    `::highlight(${highlightName('wordest', column)}){${word('dashed')}}`,
    `::highlight(${highlightName('sus', column)}){text-decoration:underline dotted var(--color-on-warning-container) 2px;text-underline-offset:.32em;}`
  ].join('\n')
}

/** משתני הצבע של פס השורה הנוכחית */
export function bandVars(strength) {
  const hl = MIRROR_HIGHLIGHT[strength] || MIRROR_HIGHLIGHT.strong
  return { '--rt-band': hl.band, '--rt-multi': hl.multi }
}
