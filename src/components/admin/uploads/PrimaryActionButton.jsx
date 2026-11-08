import Button from '@/components/ui/Button'

/**
 * הפעולה הראשית של שורה (ספר או קובץ): כפתור טקסט באותה עמודה בכל השורות. short — תווית קצרה
 * ("הורד (91)") ברשימה בינונית (42rem–56rem), שם עמודת הפעולה צרה; ברשימה צרה (שורה משלה) וברחבה
 * — המלאה. השם הנגיש תמיד המלא.
 *
 * @param {{ action: { icon: string, label: string, short?: string, loading?: boolean, onClick: () => void }, disabled?: boolean }} props
 */
export default function PrimaryActionButton({ action, disabled = false }) {
  return (
    <Button
      variant="text"
      size="sm"
      icon={action.icon}
      loading={action.loading}
      disabled={disabled}
      onClick={action.onClick}
      aria-label={action.short ? action.label : undefined}
    >
      {action.short ? (
        <>
          <span aria-hidden="true" className="@max-2xl:hidden @4xl:hidden">{action.short}</span>
          <span aria-hidden="true" className="hidden @max-2xl:inline @4xl:inline">{action.label}</span>
        </>
      ) : action.label}
    </Button>
  )
}
