import AppIcon from '@/components/ui/AppIcon'
import { KEY_HELP } from './look'

// ההסבר הקצר שבעורך: מה עושים, המוסכמות, והמקשים. ההוראות המלאות שהמנהל עורך (TrainingProofGuide) —
// מוצגות מעליו (GuideBox section="frames").
export default function FramesGuide({ open = false }) {
  return (
    <details className="rounded-card bg-surface-container-low px-4 py-2" open={open} data-testid="frames-guide">
      <summary className="flex cursor-pointer items-center gap-1.5 font-bold text-primary">
        <AppIcon name="help_outline" className="text-xl" /> איך מסמנים
      </summary>
      <div className="grid gap-4 py-2 text-body-sm md:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <h4 className="font-bold">מה עושים</h4>
          <ul className="list-disc ps-5">
            <li>כל אזור-טקסט בעמוד מוקף במסגרת, ולכל מסגרת זרם (לאיזה טקסט היא שייכת, Alt+1…9).</li>
            <li>הסוג (פנים, פירוש, הערות…) שייך לזרם: מסגרת מקבלת אותו מהזרם שלה. כיתוב (5) — בתוך הזרם.</li>
            <li>סדר הקריאה: בוחרים מסגרת, ובלוח שבצד "מוקדם יותר" / "מאוחר יותר" (Alt+↑ / Alt+↓). לכל העמוד בבת אחת — O, ואז לוחצים על המסגרות לפי הסדר.</li>
            <li>טקסט שממשיך בעמוד הבא — C על המסגרת שלו.</li>
            <li>בודקים את כל העמוד, ואז Enter — "העמוד נכון". עוברים לבד לעמוד הבא.</li>
          </ul>
          <h4 className="font-bold">מוסכמות</h4>
          <ul className="list-disc ps-5">
            <li>כותרת-רצה ומספר-עמוד — מסגרת "ריהוט" לכל אחד.</li>
            <li>כותרת-פרק באמצע העמוד — חלק מהמסגרת של הזרם שהיא פותחת. כותרת מעל כמה טורים — מסגרת משלה, באותו זרם.</li>
            <li>שני טורים של אותו טקסט — שתי מסגרות באותו זרם.</li>
            <li>כשההצמדה לדיו דולקת, המסגרת נצמדת לקצוות הדיו שבתוכה. S מכבה אותה.</li>
          </ul>
        </div>
        <div>
          <h4 className="mb-1.5 font-bold">מקשים</h4>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
            {KEY_HELP.map(([k, v]) => (
              <div key={k} className="contents">
                <dt>
                  <kbd className="rounded border border-outline-variant bg-surface px-1.5 text-label-sm">{k}</kbd>
                </dt>
                <dd className="text-on-surface-variant">{v}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </details>
  )
}
