import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import PluginStateBanners from './PluginStateBanners'

const live = { id: 'p1', version: '1.0.0', latestVersion: undefined, isHistoricalVersion: false, isSuspended: false }

describe('PluginStateBanners', () => {
  it('לא מרנדר דבר לגרסה חיה שאינה מושהית', () => {
    const { container } = render(<PluginStateBanners plugin={live} canEdit={false} suspendedByAdmin={false} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('גרסה ישנה: הודעה עם הגרסה העדכנית וקישור אליה', () => {
    render(
      <PluginStateBanners
        plugin={{ ...live, version: '1.0.0', latestVersion: '1.2.0', isHistoricalVersion: true }}
        canEdit={false}
        suspendedByAdmin={false}
      />
    )
    const note = screen.getByRole('note')
    expect(note).toHaveAttribute('data-tone', 'warning')
    expect(note).toHaveTextContent('גרסה ישנה (1.0.0)')
    expect(note).toHaveTextContent('הגרסה העדכנית היא 1.2.0.')
    expect(screen.getByRole('link', { name: /עבור לגרסה העדכנית/ })).toHaveAttribute('href', '/plugins/p1')
  })

  it('מושהה בניהול — המעלה מתבקש לפנות למנהל', () => {
    render(<PluginStateBanners plugin={{ ...live, isSuspended: true }} canEdit suspendedByAdmin />)
    const note = screen.getByRole('note')
    expect(note).toHaveAttribute('data-tone', 'error')
    expect(note).toHaveTextContent('התוסף מושהה על ידי הנהלת האתר')
    expect(note).toHaveTextContent('להחזרת התוסף לחנות יש לפנות למנהל.')
  })

  it('מושהה על ידי המעלה — "על ידך" והפניה לכפתור ההחזרה', () => {
    render(<PluginStateBanners plugin={{ ...live, isSuspended: true }} canEdit suspendedByAdmin={false} />)
    expect(screen.getByRole('note')).toHaveTextContent('התוסף מושהה על ידך')
    expect(screen.getByRole('note')).toHaveTextContent('בכפתור "החזר לחנות"')
  })
})

describe('PluginStateBanners — תוסף שירות', () => {
  it('האזהרה הקבועה של המפרט, מילה במילה', () => {
    render(<PluginStateBanners plugin={{ id: 'p1', version: '1.0.0', isHistoricalVersion: false, isSuspended: false, hasService: true }} canEdit={false} suspendedByAdmin={false} />)
    const note = screen.getByRole('note')
    expect(note).toHaveTextContent('התוסף דורש שירות חיצוני')
    expect(note).toHaveTextContent(
      'התוכנה החיצונית פועלת ברקע גם כשאוצריא סגורה. התחזוקה, האיכות וצריכת המשאבים תלויות במפתח. הסרת התוסף אינה מסירה את השירות. בדיקות החנות אינן מבטיחות היעדר תקלות או סיכוני אבטחה.'
    )
  })
})
