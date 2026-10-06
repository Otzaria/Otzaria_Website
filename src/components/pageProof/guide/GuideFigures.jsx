// האיורים של דף ההנחיות להגהת עמודים (app/docs/page-proof) — שרטוטים סינתטיים ב-SVG בלבד: "עמוד" עם פסים
// במקום שורות, בלי סריקה ובלי טקסט מספר אמיתי. הצבעים כמו בעורך: ראשי כחול, הערות ירוק, ריהוט אפור מקווקו.
// רכיב-שרת (בלי state) — נכנס כמו שהוא ל-HTML של הדף. טקסט עברי ב-SVG — בלי direction: אלגוריתם-הכיוון של
// הדפדפן מסדר את האותיות, ו-textAnchor="end" מיישר לימין ב-x.

const MAIN = '#1a56db'
const NOTES = '#0e7f3c'
const FURN = '#9ca3af'
const INK = '#4b5563'
const RED = '#dc2626'

// שורות-טקסט מדומות: פסים אפורים מעוגלים, מיושרים לימין (עברית)
function Lines({ x, y, w, n, gap = 14, h = 6, last = 0.6 }) {
  return Array.from({ length: n }, (_, i) => {
    const lw = i === n - 1 ? w * last : w
    return <rect key={i} x={x + w - lw} y={y + i * gap} width={lw} height={h} rx={3} fill={INK} opacity={0.55} />
  })
}

function Frame({ x, y, w, h, color, label, dashed = false }) {
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx={4} fill={color} fillOpacity={0.06} stroke={color} strokeWidth={2} strokeDasharray={dashed ? '6 4' : undefined} />
      <g transform={`translate(${x + w - 4}, ${y - 9})`}>
        <rect x={-label.length * 7 - 10} y={-7} width={label.length * 7 + 14} height={15} rx={7} fill="#fff" stroke={color} />
        <text x={-4} y={4} textAnchor="end" fontSize="10" fontWeight="700" fill={color}>
          {label}
        </text>
      </g>
    </g>
  )
}

function Furniture({ x, y, w, h, label }) {
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx={2} fill={FURN} fillOpacity={0.12} stroke="#6b7280" strokeWidth={1.25} strokeDasharray="2 3" />
      <text x={x + w - 3} y={y - 3} textAnchor="end" fontSize="9" fill="#4b5563">
        {label}
      </text>
    </g>
  )
}

function Figure({ title, caption, children, viewBox, label }) {
  return (
    <figure className="m-0">
      <svg viewBox={viewBox} role="img" aria-label={label || title} className="mx-auto block h-auto w-full max-w-md rounded-xl border border-surface-variant bg-white">
        {children}
      </svg>
      <figcaption className="mt-2 text-center text-sm text-on-surface/70">
        <b>{title}</b>
        {caption ? ` — ${caption}` : ''}
      </figcaption>
    </figure>
  )
}

// שני טורים = שתי מסגרות באותו זרם; הערות מתחת לקו = מסגרת משלהן; הריהוט — מסגרת "ריהוט הדף"
export function TwoColumnsFigure() {
  return (
    <Figure viewBox="0 0 360 300" title="שני טורים = שתי מסגרות" caption="הימנית 1, השמאלית 2; ההערות שמתחת לקו — מסגרת משלהן" label="עמוד בשני טורים עם הערות בתחתית, ומסגרת סביב כל טור וסביב ההערות">
      <rect x="20" y="10" width="320" height="280" rx="6" fill="#fafaf9" stroke="#d6d3d1" />
      <Frame x={112} y={18} w={136} h={26} color={FURN} label="ריהוט" />
      <Furniture x={120} y={26} w={120} h={10} label="" />
      <Frame x={190} y={56} w={130} h={128} color={MAIN} label="ראשי 1" />
      <Lines x={198} y={66} w={114} n={8} />
      <Frame x={40} y={56} w={130} h={128} color={MAIN} label="ראשי 2" />
      <Lines x={48} y={66} w={114} n={8} />
      <line x1="40" y1="198" x2="320" y2="198" stroke={FURN} strokeWidth="1.5" />
      <Frame x={40} y={214} w={280} h={50} color={NOTES} label="הערות 1" />
      <Lines x={48} y={222} w={264} n={3} gap={12} h={5} />
      <Furniture x={170} y={272} w={20} h={10} label="" />
    </Figure>
  )
}

// ריהוט הדף: מסגרת "ריהוט הדף" — גם סביב מה שהמחשב כבר זיהה (אפור מקווקו); בלי הגהה; כותרת-פרק — חלק מהטקסט
export function FurnitureFigure() {
  return (
    <Figure viewBox="0 0 360 220" title="מסגרת לריהוט הדף" caption="כותרת-רצה, מספר עמוד, מילת-ההמשך — מסגרת «ריהוט הדף» (גם כשהם באפור); אין להגיה אותם" label="ראש העמוד ותחתיתו: כותרת-רצה ומספר עמוד מסומנים באפור מקווקו">
      <rect x="20" y="10" width="320" height="200" rx="6" fill="#fafaf9" stroke="#d6d3d1" />
      <Furniture x={250} y={30} w={70} h={10} label="מספר עמוד" />
      <Furniture x={110} y={30} w={130} h={10} label="כותרת-רצה" />
      <Lines x={40} y={60} w={280} n={6} />
      <rect x={130} y={148} width={100} height={8} rx={3} fill={MAIN} opacity={0.8} />
      <text x={230} y={143} textAnchor="end" fontSize="9" fill={MAIN}>
        כותרת פרק — חלק מהטקסט
      </text>
      <Lines x={40} y={166} w={280} n={1} last={1} />
      <Furniture x={40} y={186} w={50} h={10} label="מילת-המשך" />
    </Figure>
  )
}

// שורה שנחתכה על פני שני טורים ← פיצול במצב "שורות" (לפני ← אחרי)
export function SplitLineFigure() {
  return (
    <Figure viewBox="0 0 360 170" title="שורה שחתוכה לא נכון ← פיצול" caption="במצב «שורות»: «פיצול» ולחיצה בדיוק בין הטורים" label="לפני: תיבה אחת על פני שני טורים; אחרי: שתי תיבות, אחת בכל טור">
      <text x="340" y="22" textAnchor="end" fontSize="11" fontWeight="700" fill={INK}>
        לפני
      </text>
      <rect x="40" y="34" width="290" height="22" rx="3" fill="none" stroke={RED} strokeWidth="2" strokeDasharray="5 3" />
      <rect x="196" y="42" width="126" height="6" rx="3" fill={INK} opacity={0.55} />
      <rect x="48" y="42" width="126" height="6" rx="3" fill={INK} opacity={0.55} />
      <line x1="185" y1="28" x2="185" y2="62" stroke={RED} strokeWidth="2" strokeDasharray="4 2" />
      <text x="185" y="76" textAnchor="middle" fontSize="9" fill={RED}>
        לחיצה כאן
      </text>
      <text x="340" y="104" textAnchor="end" fontSize="11" fontWeight="700" fill={INK}>
        אחרי
      </text>
      <rect x="190" y="116" width="140" height="22" rx="3" fill="none" stroke="#6b7280" strokeWidth="1.5" />
      <rect x="196" y="124" width="126" height="6" rx="3" fill={INK} opacity={0.55} />
      <rect x="40" y="116" width="140" height="22" rx="3" fill="none" stroke="#6b7280" strokeWidth="1.5" />
      <rect x="48" y="124" width="126" height="6" rx="3" fill={INK} opacity={0.55} />
    </Figure>
  )
}

// מספר-סעיף מודגש, והפסקה — "דיבור המתחיל" (מילות הפתיחה מודגשות אפור לבד). מילים סינתטיות
export function SectionNumberFigure() {
  return (
    <figure className="m-0">
      <div dir="rtl" role="img" aria-label="שורה שמתחילה במספר-סעיף מודגש ואחריו מילות הפתיחה של דיבור-המתחיל" className="mx-auto max-w-md rounded-xl border border-surface-variant bg-white px-5 py-4 text-lg leading-relaxed">
        <b>יב</b> <span className="font-bold text-on-surface/60">מילות הפתיחה כאן.</span> והמשך הפירוש בפסקה, כמו שהוא כתוב בדף…
      </div>
      <figcaption className="mt-2 text-center text-sm text-on-surface/70">
        <b>מספר סעיף + דיבור המתחיל</b> — המספר: B (מודגש, בלי גרשיים); הפסקה: «דיבור המתחיל»
      </figcaption>
    </figure>
  )
}

// המספר הקטן שאחרי המילה (①) ← "בטל קישור"
export function UnlinkFigure() {
  return (
    <figure className="m-0">
      <div dir="rtl" className="mx-auto max-w-md rounded-xl border border-surface-variant bg-white px-5 py-4">
        <p className="text-lg">
          והמשך הדברים כאן<sup className="mx-px text-[0.65em] font-bold text-info-700">①</sup> ועוד מילים
        </p>
        <div className="mt-2 w-64 rounded-lg border border-surface-variant p-2 text-sm shadow-md">
          <div className="mb-1 border-b border-surface-variant pb-1 text-xs text-on-surface/70">
            <b className="text-info-700">①</b> קישור · הערה · אוטומטי
          </div>
          <div className="flex flex-wrap gap-1">
            <span className="rounded-md bg-surface-variant/70 px-2 py-0.5 text-xs font-bold">עבור לצד השני</span>
            <span className="rounded-md bg-success-100 px-2 py-0.5 text-xs font-bold text-success-800">✓ נכון</span>
            <span className="rounded-md bg-danger-600 px-2 py-0.5 text-xs font-bold text-white">✗ בטל קישור</span>
          </div>
        </div>
      </div>
      <figcaption className="mt-2 text-center text-sm text-on-surface/70">
        <b>קישור שגוי</b> — לחיצה על המספר שאחרי המילה ← «בטל קישור»
      </figcaption>
    </figure>
  )
}
