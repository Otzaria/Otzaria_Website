// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createHash } from 'node:crypto'

const sent = vi.hoisted(() => [])
vi.mock('@/lib/smtp-transport', () => ({
  createSmtpTransport: () => ({ sendMail: async (m) => { sent.push(m) } }),
  createCustomSmtpTransport: vi.fn(),
}))
vi.mock('@/app/api/user/unsubscribe/route', () => ({ encryptToken: vi.fn() }))
vi.mock('@/models/User', () => ({ default: {} }))
vi.mock('@/models/MailingList', () => ({ default: {} }))
vi.mock('@/lib/db', () => ({ default: vi.fn() }))

const { sendAppReportClosedNotification, sendAppReportContactEmail } = await import('./emailService.js')

// טביעת המייל כולו (שולח, נושא, מענה, HTML). הערכים חושבו מהקוד שלפני הוספת המוצרים — מייל של אוצריא לא השתנה.
const fingerprint = (m) => createHash('sha256').update(JSON.stringify([m.from, m.to, m.subject, m.replyTo, m.html, m.list ?? null])).digest('hex')

const closed = (over = {}) => ({
  to: 'r@example.com', reportTitle: 'החיפוש לא עובד', issueUrl: 'https://github.com/Otzaria/otzaria/issues/100',
  reasonText: 'הדיווח נסגר.', unsubscribeUrl: 'https://otzaria.org/api/app-reports/unsubscribe?token=t', ...over,
})
const contact = (over = {}) => ({
  to: 'r@example.com', subject: 'שאלה', message: 'אפשר פרטים?', reportTitle: 'החיפוש לא עובד', replyTo: 'reply+abc@reply.otzaria.org', ...over,
})

const GOLDEN_CLOSED = '04edf7a88cca2dc8b440ff820a77cae88e74d20e0330ce20f5f12b0f290613ae'
const GOLDEN_CONTACT = '29e72e5401571fa874b3f86111cd85ef0610599422f014335668daffdf975d93'

describe('מיילי דיווחי התוכנה לפי מוצר', () => {
  beforeEach(() => {
    sent.length = 0
    process.env.NEXTAUTH_URL = 'https://otzaria.org'
    process.env.SMTP_FROM = 'no-reply@otzaria.org'
    process.env.SMTP_REPLY_TO = 'office@otzaria.org'
  })

  it('אוצריא (בלי product או עם "otzaria"): המייל זהה לחלוטין לקודם', async () => {
    for (const product of [undefined, 'otzaria']) {
      sent.length = 0
      expect(await sendAppReportClosedNotification(closed({ product }))).toEqual({ sent: true })
      expect(await sendAppReportContactEmail(contact({ product }))).toEqual({ sent: true })
      expect(fingerprint(sent[0])).toBe(GOLDEN_CLOSED)
      expect(fingerprint(sent[1])).toBe(GOLDEN_CONTACT)
    }
  })

  it('עדכוני אוצריא: שם המוצר בשולח, בכותרת ובשורת התודה', async () => {
    await sendAppReportClosedNotification(closed({ product: 'offline-update' }))
    await sendAppReportContactEmail(contact({ product: 'offline-update' }))
    const [c, k] = sent
    expect(c.from.name).toBe('עדכוני אוצריא')
    expect(c.html).toContain('תודה שעזרת לשפר את עדכוני אוצריא!')
    expect(c.html).toContain('>עדכוני אוצריא</h2>')
    expect(k.from.name).toBe('צוות עדכוני אוצריא')
    expect(k.html).toContain('>עדכוני אוצריא</h2>')
    expect(k.replyTo).toBe('reply+abc@reply.otzaria.org')
  })
})
