// עזרי תאריך עברי משותפים לדפי חנות התוספים.
// חולץ מ-src/app/plugins/page.tsx (ראו docs/PLUGIN_STORE_REDESIGN_PLAN.md סעיף 7.0).

// המרת מספר לגימטריה עברית
export const toHebrewNumeral = (num: number): string => {
  const ones = ['', 'א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ז', 'ח', 'ט']
  const tens = ['', 'י', 'כ', 'ל', 'מ', 'נ', 'ס', 'ע', 'פ', 'צ']
  const hundreds = ['', 'ק', 'ר', 'ש', 'ת']
  const thousands = ['', 'א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ז', 'ח', 'ט']

  if (num === 0) return ''
  if (num > 9999) return num.toString()

  let result = ''

  // אלפים
  const thousandsDigit = Math.floor(num / 1000)
  if (thousandsDigit > 0) {
    result += thousands[thousandsDigit] + "'"
    num %= 1000
  }

  // מאות - טיפול במאות מעל 400
  const hundredsDigit = Math.floor(num / 100)
  if (hundredsDigit > 0) {
    if (hundredsDigit <= 4) {
      result += hundreds[hundredsDigit]
    } else if (hundredsDigit === 5) {
      result += 'תק' // 500
    } else if (hundredsDigit === 6) {
      result += 'תר' // 600
    } else if (hundredsDigit === 7) {
      result += 'תש' // 700
    } else if (hundredsDigit === 8) {
      result += 'תת' // 800
    } else if (hundredsDigit === 9) {
      result += 'תתק' // 900
    }
    num %= 100
  }

  // טיפול מיוחד ב-15 ו-16 (ט"ו, ט"ז במקום י"ה, י"ו)
  if (num === 15) {
    result += 'טו'
  } else if (num === 16) {
    result += 'טז'
  } else {
    // עשרות
    const tensDigit = Math.floor(num / 10)
    if (tensDigit > 0) {
      result += tens[tensDigit]
      num %= 10
    }

    // יחידות
    if (num > 0) {
      result += ones[num]
    }
  }

  // הוספת גרש או גרשיים
  if (result.length === 1) {
    result += "'"
  } else if (result.length > 1) {
    result = result.slice(0, -1) + '"' + result.slice(-1)
  }

  return result
}

export const formatHebrewDate = (dateStr: string) => {
  try {
    let date: Date

    // אם זה ISO timestamp (כולל שעה)
    if (dateStr.includes('T')) {
      date = new Date(dateStr)
    } else {
      // אם זה תאריך פשוט (YYYY-MM-DD)
      const [year, month, dayNum] = dateStr.split('-').map(Number)
      date = new Date(Date.UTC(year, month - 1, dayNum, 12))
    }

    const formatter = new Intl.DateTimeFormat('he-u-ca-hebrew', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC'
    })

    const formatted = formatter.format(date)

    // פירוק התאריך לחלקים
    const parts = formatter.formatToParts(date)
    const dayPart = parts.find(p => p.type === 'day')
    const monthPart = parts.find(p => p.type === 'month')
    const yearPart = parts.find(p => p.type === 'year')

    if (!dayPart || !monthPart || !yearPart) {
      return formatted // fallback למקרה של בעיה
    }

    const day = parseInt(dayPart.value)
    const monthName = monthPart.value
    const year = parseInt(yearPart.value)

    return `${toHebrewNumeral(day)} ${monthName} ${toHebrewNumeral(year)}`
  } catch (error) {
    console.error('Error formatting date:', error, dateStr)
    return dateStr
  }
}
