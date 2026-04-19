'use client'

import Link from 'next/link'

/**
 * Reusable button component supporting both button and link elements
 * @param {Object} props
 * @param {string} [props.label] - Button text
 * @param {string} [props.href] - Link href (if this is a link button)
 * @param {Function} [props.onClick] - Click handler (if this is a button)
 * @param {string} [props.variant] - Button style: 'primary', 'secondary', 'outline', 'ghost'
 * @param {string} [props.size] - Button size: 'sm', 'md', 'lg'
 * @param {string} [props.icon] - Material icon name to show before text
 * @param {boolean} [props.loading] - Show loading state
 * @param {boolean} [props.disabled] - Disable button
 * @param {boolean} [props.fullWidth] - Make button full width
 * @param {string} [props.className] - Additional CSS classes
 */
export default function Button({
  label,
  href,
  onClick,
  variant = 'primary',
  size = 'md',
  icon,
  loading = false,
  disabled = false,
  fullWidth = false,
  className = '',
  ...rest
}) {
  const variantClasses = {
    primary: 'bg-primary text-on-primary hover:bg-accent',
    secondary: 'bg-secondary text-on-secondary hover:bg-secondary/90',
    outline: 'border-2 border-primary text-primary hover:bg-primary-container',
    ghost: 'text-primary hover:bg-primary/10',
    danger: 'bg-red-600 text-white hover:bg-red-700'
  }

  const sizeClasses = {
    sm: 'px-3 py-1.5 text-sm',
    md: 'px-6 py-2.5 text-base',
    lg: 'px-8 py-3.5 text-lg'
  }

  const baseClasses = `
    inline-flex items-center justify-center gap-2 rounded-lg font-medium 
    transition-all duration-200 ${variantClasses[variant]} ${sizeClasses[size]}
    ${fullWidth ? 'w-full' : ''} 
    ${loading || disabled ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}
    ${className}
  `

  // If it's a link, render as Link
  if (href) {
    return (
      <Link href={href} className={baseClasses} {...rest}>
        {icon && <span className="material-symbols-outlined text-xl">{icon}</span>}
        {label}
      </Link>
    )
  }

  // Otherwise render as button
  return (
    <button
      onClick={onClick}
      disabled={loading || disabled}
      className={baseClasses}
      {...rest}
    >
      {loading ? (
        <span className="material-symbols-outlined text-xl animate-spin">
          progress_activity
        </span>
      ) : icon ? (
        <span className="material-symbols-outlined text-xl">{icon}</span>
      ) : null}
      {label}
    </button>
  )
}
