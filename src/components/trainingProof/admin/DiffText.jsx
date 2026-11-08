import { wordDiff } from './wordDiff'

// ההבדל בין שני נוסחים ברמת מילה: מה שנמחק מסומן באדום וקו חוצה, ומה שנוסף — בירוק (טוקני diff של האתר)
export default function DiffText({ from, to, dir }) {
  return (
    <span dir={dir} className="leading-7">
      {wordDiff(from, to).map((d, i) => (
        <span key={i}>
          {i > 0 && ' '}
          {d.op === 'same' ? d.t : d.op === 'del'
            ? <del className="rounded-(--radius-xs) bg-diff-remove-mark px-0.5 text-on-surface">{d.t}</del>
            : <ins className="rounded-(--radius-xs) bg-diff-add-mark px-0.5 text-on-surface no-underline">{d.t}</ins>}
        </span>
      ))}
    </span>
  )
}
