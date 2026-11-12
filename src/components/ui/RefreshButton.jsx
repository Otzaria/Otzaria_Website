import Button from './Button'

/**
 * "רענן" — טעינה מחדש של התצוגה בלבד. busy — טעינה באמצע: הכפתור נעול, והפוקוס נשאר עליו.
 * @param {{ onClick: () => void, busy?: boolean, label?: string }} props
 */
export default function RefreshButton({ onClick, busy = false, label = 'רענן' }) {
  return (
    <Button variant="text" size="sm" icon="refresh" onClick={onClick} softDisabled={busy}>
      {label}
    </Button>
  )
}
