import Image from 'next/image'
import AppIcon from '@/components/ui/AppIcon'
import Card from '@/components/ui/Card'
import NewWindowHint from '@/components/ui/NewWindowHint'

export type SponsorCompany = {
  name: string
  url: string
  logo: string
  width: number
  height: number
}

/**
 * כרטיס חברה תורמת: כל הכרטיס קישור לאתר החברה (חלון חדש). הלוגו בצבעיו המקוריים על משטח
 * בהיר אחיד — גם בערכה הכהה (dark:bg-on-surface — הגוון הבהיר של הערכה), כדי שחלקים כהים
 * בלוגו ייראו. השם מתחת ללוגו; alt ריק כי השם כבר כתוב.
 */
export default function CompanyCard({ company }: { company: SponsorCompany }) {
  return (
    <li className="flex">
      <Card href={company.url} external padding="sm" className="flex w-full flex-col gap-2">
        <span className="flex min-h-0 w-full flex-1 items-center justify-center rounded-control bg-surface-container-low p-3 dark:bg-on-surface">
          <Image
            src={company.logo}
            alt=""
            width={company.width}
            height={company.height}
            className="h-full w-auto max-w-full object-contain transition-transform duration-300 ease-standard group-hover:scale-[1.03] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
          />
        </span>
        <span className="flex items-center justify-center gap-1.5 text-center text-label-md text-on-surface">
          {company.name}
          <NewWindowHint />
          <AppIcon name="open_in_new" className="shrink-0 text-base text-on-surface-variant" />
        </span>
      </Card>
    </li>
  )
}
