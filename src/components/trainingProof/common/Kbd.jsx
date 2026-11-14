// מקש במקלדת — בשורת-ההסבר ובתוך כפתורים
export default function Kbd({ children, className = '' }) {
  return (
    <kbd
      className={`inline-block rounded border border-current/40 border-b-2 px-1.5 py-px font-sans text-[11px] leading-none font-semibold opacity-80 ${className}`}
    >
      {children}
    </kbd>
  )
}
