import { afterEach, describe, expect, test, vi } from 'vitest'
import { uploadBook } from './booksApi'

function mockXhr({ status, responseText }) {
  class FakeXhr {
    constructor() {
      this.upload = {}
      this.status = status
      this.responseText = responseText
      this.responseURL = ''
    }
    open() {}
    send() {
      queueMicrotask(() => this.onload())
    }
  }
  vi.stubGlobal('XMLHttpRequest', FakeXhr)
}

describe('uploadBook — הודעות שגיאה', () => {
  afterEach(() => vi.unstubAllGlobals())

  test('חסימת השבת: ההסבר ולא המילה shabbat', async () => {
    mockXhr({ status: 503, responseText: JSON.stringify({ error: 'shabbat', message: 'האתר סגור בשבת' }) })
    await expect(uploadBook(new FormData())).rejects.toMatchObject({ status: 503, message: 'האתר סגור בשבת' })
  })

  test('503 עומס המרה: הודעת השרת בעברית', async () => {
    mockXhr({ status: 503, responseText: JSON.stringify({ error: 'שרת ההמרה עמוס. נסה שוב מאוחר יותר.' }) })
    await expect(uploadBook(new FormData())).rejects.toMatchObject({ message: 'שרת ההמרה עמוס. נסה שוב מאוחר יותר.' })
  })

  test('503 בלי JSON: הודעת עומס כללית בעברית', async () => {
    mockXhr({ status: 503, responseText: '<html>busy</html>' })
    await expect(uploadBook(new FormData())).rejects.toMatchObject({ message: 'השרת עמוס כרגע. נסה שוב בעוד רגע.' })
  })
})
