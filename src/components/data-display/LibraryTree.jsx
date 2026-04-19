'use client'

import { useState } from 'react'
import { statusConfig } from '@/lib/library-data'

export default function LibraryTree({ items, onFileClick }) {
  return (
    <div className="space-y-0.5">
      {items.map((item) => (
        <TreeItem key={item.id} item={item} onFileClick={onFileClick} />
      ))}
    </div>
  )
}

function TreeItem({ item, level = 0, onFileClick }) {
  const [isOpen, setIsOpen] = useState(level === 0)
  const [isHovered, setIsHovered] = useState(false)
  const isFolder = item.type === 'folder'
  const hasChildren = item.children && item.children.length > 0

  const handleClick = () => {
    if (isFolder) {
      setIsOpen(!isOpen)
    } else {
      onFileClick(item)
    }
  }

  const status = item.status ? statusConfig[item.status] : null

  return (
    <div>
      <div
        onClick={handleClick}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        className={`
          group relative flex items-center gap-3 px-4 py-3 cursor-pointer transition-all duration-200
          ${isFolder 
            ? 'hover:bg-primary/10' 
            : 'hover:bg-surface hover:scale-[1.01]'
          }
          ${level > 0 ? 'border-r-2 border-surface-variant/30' : ''}
          ${isHovered && !isFolder ? 'bg-surface/50' : ''}
        `}
        style={{ 
          marginRight: `${level * 20}px`,
          borderRadius: level === 0 ? '12px' : '8px'
        }}
      >
        {/* Connection Line for nested items */}
        {level > 0 && (
          <div className="absolute right-0 top-0 bottom-0 w-0.5 bg-gradient-to-b from-primary/20 to-transparent" />
        )}

        {/* Expand/Collapse Button for Folders */}
        {isFolder && hasChildren && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              setIsOpen(!isOpen)
            }}
            className="flex-shrink-0 w-6 h-6 flex items-center justify-center rounded-md hover:bg-primary/20 transition-colors"
          >
            <span className={`material-symbols-outlined text-lg text-primary transition-transform duration-200 ${isOpen ? 'rotate-90' : ''}`}>
              chevron_left
            </span>
          </button>
        )}

        {/* Spacer for items without expand button */}
        {(!isFolder || !hasChildren) && <div className="w-6" />}

        {/* Icon with background */}
        <div className={`
          flex-shrink-0 w-10 h-10 flex items-center justify-center rounded-lg transition-all
          ${isFolder 
            ? 'bg-primary/10 group-hover:bg-primary/20' 
            : status?.bgColor || 'bg-surface'
          }
        `}>
          <span className={`material-symbols-outlined text-xl ${isFolder ? 'text-primary' : status?.color || 'text-on-surface'}`}>
            {isFolder ? (isOpen ? 'folder_open' : 'folder') : status?.icon || 'description'}
          </span>
        </div>

        {/* Name */}
        <span className={`
          flex-1 font-medium transition-colors
          ${isFolder ? 'text-on-surface text-base' : 'text-on-surface/90 text-sm'}
          group-hover:text-primary
        `}>
          {item.name}
        </span>

        {/* File Count for Folders */}
        {isFolder && hasChildren && (
          <span className="flex-shrink-0 px-2 py-1 text-xs font-medium text-on-surface/50 bg-surface rounded-md">
            {item.children.length}
          </span>
        )}

        {/* Status Badge for Files */}
        {status && (
          <div className="flex-shrink-0 flex items-center gap-2">
            <span className={`
              px-3 py-1.5 rounded-lg text-xs font-bold border-2
              ${status.bgColor} ${status.color} ${status.borderColor}
              transition-all
            `}>
              {status.label}
            </span>
          </div>
        )}

        {/* Hover indicator */}
        {isHovered && !isFolder && (
          <span className="material-symbols-outlined text-primary animate-pulse">
            arrow_back
          </span>
        )}
      </div>

      {/* Children with animation */}
      {isFolder && isOpen && hasChildren && (
        <div className={`
          mt-1 space-y-0.5 overflow-hidden
          animate-in slide-in-from-right-2 fade-in duration-200
        `}>
          {item.children.map((child) => (
            <TreeItem
              key={child.id}
              item={child}
              level={level + 1}
              onFileClick={onFileClick}
            />
          ))}
        </div>
      )}
    </div>
  )
}
