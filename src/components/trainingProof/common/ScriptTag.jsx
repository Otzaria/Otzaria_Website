import { SCRIPT_LABELS } from '@/lib/trainingProof/vocab'
import { scriptStyle } from './scripts'

// תגית-כתב צבעונית ("רש״י", "מרובע"…) — על כל שורה בזיהוי, ובמקרא בדף הבית
export default function ScriptTag({ script, className = '', ...rest }) {
  return (
    <span
      {...rest}
      style={scriptStyle(script)}
      className={`inline-flex items-center rounded-md bg-(--tp-c) px-2 py-0.5 text-label-sm font-bold whitespace-nowrap text-white ${className}`}
    >
      {SCRIPT_LABELS[script] || script}
    </span>
  )
}
