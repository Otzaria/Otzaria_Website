'use client'

import Link from 'next/link'

/**
 * Reusable component for displaying a list of links
 * @param {Object} props
 * @param {string} props.title - Section title
 * @param {Array} props.links - Array of link objects {href, label, icon, external}
 * @param {string} props.variant - Link styling: 'default', 'highlighted', 'subtle'
 */
export default function LinkList({ title, links = [], variant = 'default' }) {
  const linkClasses = {
    default: 'text-on-surface/70 hover:text-primary',
    highlighted: 'text-on-surface hover:text-primary font-medium',
    subtle: 'text-on-surface/50 hover:text-on-surface/70'
  }

  return (
    <div>
      {title && (
        <h3 className="font-bold mb-4 text-on-surface text-lg">
          {title}
        </h3>
      )}
      <ul className="space-y-3">
        {links.map((link, index) => (
          <li key={index}>
            {link.external ? (
              <a
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
                className={`${linkClasses[variant]} transition-colors flex items-center gap-2 group`}
              >
                {link.icon && (
                  <span className="material-symbols-outlined text-sm">
                    {link.icon}
                  </span>
                )}
                {link.label}
              </a>
            ) : (
              <Link
                href={link.href}
                className={`${linkClasses[variant]} transition-colors flex items-center gap-2 group`}
              >
                {link.icon && (
                  <span className="material-symbols-outlined text-sm">
                    {link.icon}
                  </span>
                )}
                {link.label}
              </Link>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
