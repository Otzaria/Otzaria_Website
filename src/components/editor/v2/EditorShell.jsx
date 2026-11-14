'use client'

import { useState } from 'react'
import { cx } from '@/components/ui/cx'
import { PortalContainerContext } from '@/components/ui/portalContainer'
import PanelSplitter from './PanelSplitter'

/**
 * הפריסה של עורך העמוד: כותרת, שני פאנלים (צילום / טקסט) עם מפריד, ושורת מצב — או, בנייד,
 * הצילום מעל הטקסט וסרגל פעולות בתחתית.
 *
 * ברירת המחדל: הצילום בימין והטקסט בשמאל (RTL — הפאנל הראשון בימין). swap מחליף צדדים;
 * orientation='horizontal' שם את הצילום מעל הטקסט (swap — מתחתיו).
 *
 * הערכה (theme) והמשתנים (styleVars) חלים על השורש בלבד — ראו styles/editor-themes.css.
 * scanFilter (בהירות/ניגודיות) חל על מכל הצילום — לא על הסרגל שמעליו.
 * התוכן עצמו (ImagePanel, TextEditor) מגיע מבחוץ, כך שהמעטפת לא תלויה בפנים שלהם.
 * חלונות צפים (ui/Dialog, CommandPalette, MenuButton, FloatingPanel) מצוירים ב-portal לשורש הזה
 * (PortalContainerContext) ולא ל-body — כך הם מקבלים את הערכה ואת המשתנים של העורך.
 *
 * @param {{
 *   theme?: string, styleVars?: Record<string, string>, fullScreen?: boolean, isMobile?: boolean,
 *   topBar: import('react').ReactNode, statusBar?: import('react').ReactNode, mobileBar?: import('react').ReactNode,
 *   orientation?: 'vertical'|'horizontal', swap?: boolean, scanSize: number,
 *   onScanSizeChange: (size: number) => void, onScanSizeCommit?: (size: number) => void,
 *   onSplitterPointer: (clientX: number, clientY: number) => void, onResizingChange?: (resizing: boolean) => void,
 *   splitContainerRef?: import('react').Ref<HTMLDivElement>, scanHostRef?: import('react').Ref<HTMLDivElement>,
 *   scanToolbar?: import('react').ReactNode, scan: import('react').ReactNode, scanFilter?: string,
 *   textToolbar?: import('react').ReactNode, text: import('react').ReactNode,
 *   children?: import('react').ReactNode
 * }} props
 */
export default function EditorShell({
  theme = 'light',
  styleVars,
  fullScreen = false,
  isMobile = false,
  topBar,
  statusBar,
  mobileBar,
  orientation = 'vertical',
  swap = false,
  scanSize,
  onScanSizeChange,
  onScanSizeCommit,
  onSplitterPointer,
  onResizingChange,
  splitContainerRef,
  scanHostRef,
  scanToolbar,
  scan,
  scanFilter = 'none',
  textToolbar,
  text,
  children
}) {
  const stacked = orientation === 'horizontal'
  const flexDirection = stacked ? (swap ? 'column-reverse' : 'column') : (swap ? 'row-reverse' : 'row')
  const scanStyle = stacked ? { height: `${scanSize}%` } : { width: `${scanSize}%` }
  const [portalHost, setPortalHost] = useState(null)

  return (
    <PortalContainerContext.Provider value={portalHost}>
      <main
        ref={setPortalHost}
        id="main-content"
        data-editor-shell=""
        data-editor-theme={theme}
        style={styleVars}
        className={cx(
          'flex flex-col overflow-hidden bg-background text-on-surface',
          fullScreen ? 'fixed inset-0 z-(--z-overlay) h-dvh w-screen' : 'h-dvh'
        )}
      >
        {topBar}

        <div ref={splitContainerRef} className="flex min-h-0 flex-1 overflow-hidden" style={{ flexDirection }}>
          <section aria-label="צילום" className="flex min-h-0 min-w-0 shrink-0 flex-col bg-surface-container-low" style={scanStyle}>
            {scanToolbar}
            <div
              ref={scanHostRef}
              data-scan-host=""
              className="flex min-h-0 min-w-0 flex-1 overflow-hidden"
              style={scanFilter && scanFilter !== 'none' ? { filter: scanFilter } : undefined}
            >
              {scan}
            </div>
          </section>

          <PanelSplitter
            orientation={orientation}
            swap={swap}
            value={scanSize}
            onChange={onScanSizeChange}
            onPointerPosition={onSplitterPointer}
            onCommit={onScanSizeCommit}
            onDraggingChange={onResizingChange}
          />

          <section aria-label="טקסט" className="flex min-h-0 min-w-0 flex-1 flex-col bg-surface">
            {textToolbar}
            <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">{text}</div>
          </section>
        </div>

        {isMobile ? mobileBar : statusBar}
        {children}
      </main>
    </PortalContainerContext.Provider>
  )
}
