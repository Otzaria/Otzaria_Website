import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { toggleFormat, clearFormatting, activeFormats, parseMarkup, changedRange } from './formatToggle.js'

/** בחירה מסומנת בטקסט: [ ... ] — בחירה; | — סמן */
function sel(marked) {
  const s = marked.indexOf('[')
  if (s >= 0) {
    const e = marked.indexOf(']') - 1
    return { raw: marked.replace('[', '').replace(']', ''), start: s, end: e }
  }
  const c = marked.indexOf('|')
  return { raw: marked.replace('|', ''), start: c, end: c }
}

/** התוצאה בסימון: הבחירה [ ... ], הסמן | */
function show({ value, start, end }) {
  if (start === end) return value.slice(0, start) + '|' + value.slice(start)
  return value.slice(0, start) + '[' + value.slice(start, end) + ']' + value.slice(end)
}

const toggle = (marked, tag) => {
  const { raw, start, end } = sel(marked)
  return show(toggleFormat(raw, start, end, tag))
}
const clear = (marked) => {
  const { raw, start, end } = sel(marked)
  return show(clearFormatting(raw, start, end))
}
const active = (marked) => {
  const { raw, start, end } = sel(marked)
  const a = activeFormats(raw, start, end)
  return Object.keys(a).filter((k) => a[k]).join(',')
}

/** קינון תקין: כל תג נסגר בסדר הפוך לפתיחה */
function wellNested(raw) {
  const stack = []
  for (const t of parseMarkup(raw).tags) {
    if (t.self) continue
    if (!t.closing) stack.push(t.name)
    else if (stack.pop() !== t.name) return false
  }
  return stack.length === 0
}

describe('toggleFormat — עטיפה', () => {
  it('עוטף בחירה; הבחירה נשארת על התוכן', () => {
    assert.equal(toggle('אב [גד] הו', 'b'), 'אב <b>[גד]</b> הו')
  })
  it('רווחים בקצוות הבחירה נשארים בחוץ', () => {
    assert.equal(toggle('אב[ גד ]הו', 'i'), 'אב <i>[גד]</i> הו')
  })
  it('בלי בחירה — המילה שתחת הסמן, והסמן נשאר במקומו', () => {
    assert.equal(toggle('אב ג|ד הו', 'u'), 'אב <u>ג|ד</u> הו')
  })
  it('סמן ברווח (אין מילה) — תג ריק והסמן בתוכו', () => {
    assert.equal(toggle('אב | הו', 'b'), 'אב <b>|</b> הו')
  })
  it('על פני כמה שורות — כל שורה נעטפת לחוד', () => {
    assert.equal(toggle('[אב\nגד]', 'b'), '<b>[אב</b>\n<b>גד]</b>')
  })
  it('חלק מהבחירה כבר מודגש — מאחד לתג אחד (בלי <b><b>)', () => {
    const out = toggle('[א <b>ב</b> ג]', 'b')
    assert.equal(out, '<b>[א ב ג]</b>')
  })
  it('תג אחר שחוצה את קצה הבחירה — נסגר ונפתח מחדש, הקינון תקין', () => {
    const out = toggle('<i>א [ב</i> ג]', 'b')
    assert.equal(out, '<i>א </i><b><i>[ב</i> ג]</b>')
    assert.ok(wellNested(out.replace(/[[\]|]/g, '')))
  })
  it('בחירה שכוללת את התגים עצמם (בתצוגת קוד)', () => {
    assert.equal(toggle('[<i>אב</i>]', 'b'), '<i><b>[אב]</b></i>')
  })
  it('strong נחשב מודגש', () => {
    assert.equal(toggle('<strong>[אב]</strong>', 'b'), '[אב]')
  })
})

describe('toggleFormat — הסרה (לחיצה שנייה)', () => {
  it('כל הבחירה מודגשת — ההדגשה מוסרת', () => {
    assert.equal(toggle('א <b>[גד]</b> ה', 'b'), 'א [גד] ה')
  })
  it('סמן בתוך מילה מודגשת — מסיר', () => {
    assert.equal(toggle('א <b>ג|ד</b> ה', 'b'), 'א ג|ד ה')
  })
  it('עטיפה ואז לחיצה שנייה — חזרה למקור בדיוק', () => {
    const raw = 'שלום עולם ומלואו'
    const once = toggleFormat(raw, 5, 9, 'b')
    const twice = toggleFormat(once.value, once.start, once.end, 'b')
    assert.equal(twice.value, raw)
    assert.deepEqual([twice.start, twice.end], [5, 9])
  })
  it('חלק מריצה — הריצה מתפצלת', () => {
    assert.equal(toggle('<b>אב [גד] הו</b>', 'b'), '<b>אב </b>[גד]<b> הו</b>')
  })
  it('פיצול בתוך תגים מקוננים — הקינון נשמר', () => {
    const out = toggle('<b>א<i>ב [ג]</i>ד</b>', 'b')
    assert.equal(out, '<b>א<i>ב </i></b><i>[ג]</i><b>ד</b>')
    assert.ok(wellNested(out.replace(/[[\]|]/g, '')))
  })
  it('קצה הבחירה בתחילת הריצה — בלי תג ריק', () => {
    assert.equal(toggle('<b>[אב] גד</b>', 'b'), '[אב]<b> גד</b>')
  })
  it('תגים לא מוכרים ותמונות נשמרים', () => {
    const out = toggle('<b>[<span class="x">א</span> <img src="a.png"> ב]</b>', 'b')
    assert.equal(out, '<span class="x">[א</span> <img src="a.png"> ב]')
  })
})

describe('toggleFormat — big/small', () => {
  it('A+ על <small> — חזרה לרגיל, בלי <big> מקונן', () => {
    assert.equal(toggle('א <small>[בג]</small>', 'big'), 'א [בג]')
  })
  it('A− על <big> — חזרה לרגיל', () => {
    assert.equal(toggle('<big>ב|ג</big>', 'small'), 'ב|ג')
  })
  it('A+ על טקסט רגיל — עוטף ב-<big>; פעם נוספת — מסיר', () => {
    assert.equal(toggle('[אב]', 'big'), '<big>[אב]</big>')
    assert.equal(toggle('<big>[אב]</big>', 'big'), '[אב]')
  })
})

describe('toggleFormat — כותרות (לשורה כולה)', () => {
  it('הופך את השורה לכותרת, ולחיצה נוספת — לפסקה', () => {
    assert.equal(toggle('א\nכותרת ה|זו\nב', 'h1'), 'א\n<h1>כותרת ה|זו</h1>\nב')
    assert.equal(toggle('א\n<h1>כותרת ה|זו</h1>\nב', 'h1'), 'א\nכותרת ה|זו\nב')
  })
  it('רמה אחרת — מחליף את הרמה', () => {
    assert.equal(toggle('<h1>כו|תרת</h1>', 'h2'), '<h2>כו|תרת</h2>')
  })
  it('שורה שמתחילה ונגמרת בתגי עיצוב — הכותרת עוטפת אותם (קינון תקין)', () => {
    const out = toggle('<b>א </b>ב<b> ג|</b>\nד', 'h1')
    assert.equal(out, '<h1><b>א </b>ב<b> ג|</b></h1>\nד')
    assert.equal(toggle(out, 'h1'), '<b>א </b>ב<b> ג|</b>\nד')
  })
  it('עיצוב פנימי בכותרת נשמר', () => {
    assert.equal(toggle('<h2>א <b>ב|</b></h2>', 'h2'), 'א <b>ב|</b>')
  })
})

describe('clearFormatting', () => {
  it('מסיר את כל תגי העיצוב בבחירה, ולא נוגע בתגים לא מוכרים', () => {
    const out = clear('[<b>א <i>ב</i></b> <span class="x"><u>ג</u></span> <big>ד</big><small>ה</small> <strong>ו</strong><em>ז</em>]')
    assert.equal(out, '[א ב <span class="x">ג</span> דה וז]')
  })
  it('חלק מריצה — רק החלק שבבחירה', () => {
    assert.equal(clear('<b><i>אב [גד] הו</i></b>'), '<b><i>אב </i></b>[גד]<b><i> הו</i></b>')
  })
  it('שורת כותרת חוזרת לפסקה (וגם העיצוב שבה)', () => {
    assert.equal(clear('<h1>א <b>ב|ג</b></h1>\nד'), 'א ב|ג\nד')
  })
  it('על פני שורות', () => {
    assert.equal(clear('[<b>א</b>\n<h3>ב</h3>\n<i>ג</i>]'), '[א\nב\nג]')
  })
  it('תמונה נשארת', () => {
    assert.equal(clear('<b>[א <img src="x.png" alt="y"> ב]</b>'), '[א <img src="x.png" alt="y"> ב]')
  })
  it('בלי עיצוב — בלי שינוי', () => {
    assert.equal(clear('[אב <span>גד</span>]'), '[אב <span>גד</span>]')
  })
})

describe('activeFormats', () => {
  it('סמן בתוך מודגש ונטוי', () => {
    assert.equal(active('<b>א<i>ב|ג</i></b>'), 'b,i')
  })
  it('בחירה שרק חלקה מודגשת — לא פעיל', () => {
    assert.equal(active('[א <b>ב</b>]'), '')
  })
  it('בחירה שכולה בתוך התג (כולל התגים עצמם)', () => {
    assert.equal(active('[<u>אב</u>]'), 'u')
  })
  it('strong/em נספרים כ-b/i; כותרת לפי השורה', () => {
    assert.equal(active('<h2><strong>א|</strong></h2>'), 'b,h2')
  })
  it('big/small', () => {
    assert.equal(active('<small>א|ב</small>'), 'small')
  })
  it('טקסט רגיל — כלום', () => {
    assert.equal(active('אב|ג'), '')
  })
})

describe('changedRange', () => {
  const applyRange = (before, r) => before.slice(0, r.from) + r.text + before.slice(r.to)
  it('הכנסה, מחיקה והחלפה — ההחלה נותנת את הטקסט החדש, והטקסט המוכנס לא ריק', () => {
    for (const [a, b] of [['אבג', 'א<b>ב</b>ג'], ['א<b>ב</b>ג', 'אבג'], ['<b>א</b>', 'א'], ['אב', 'אב'], ['<i>x</i>', '<b>x</b>']]) {
      const r = changedRange(a, b)
      if (a === b) { assert.equal(r, null); continue }
      assert.equal(applyRange(a, r), b)
      assert.ok(r.text.length > 0)
    }
  })
  it('הפעלה כפולה מחזירה את המקור (טקסט אקראי עם תגים)', () => {
    const words = ['אב', '<b>גד</b>', '<i>הו <u>זח</u></i>', '<span class="q">טי</span>', '<img src="a.png">', '<small>כל</small>', '\n']
    let seed = 7
    const rnd = (n) => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % n }
    for (let k = 0; k < 200; k++) {
      const raw = Array.from({ length: 4 + rnd(5) }, () => words[rnd(words.length)]).join(' ')
      const a = rnd(raw.length + 1)
      const b = a + rnd(raw.length - a + 1)
      for (const tag of ['b', 'i', 'u']) {
        const once = toggleFormat(raw, a, b, tag)
        assert.ok(wellNested(once.value), `nested ${tag}: ${once.value}`)
        const cleared = clearFormatting(raw, a, b)
        assert.ok(wellNested(cleared.value), `clear: ${cleared.value}`)
        assert.ok(cleared.value.includes('<span class="q">') === raw.includes('<span class="q">'))
        assert.equal((cleared.value.match(/<img/g) || []).length, (raw.match(/<img/g) || []).length)
      }
    }
  })
})

describe('כותרת על בחירה עם שורה ריקה (QA P1-2)', () => {
  it('שורה ריקה בבחירה מדולגת — בלי "</h2><h2>" הפוך', () => {
    assert.equal(toggle('[אב\n\nגד]', 'h2'), '<h2>[אב</h2>\n\n<h2>גד]</h2>')
    assert.equal(toggle('[אב\n  \nגד]', 'h2'), '<h2>[אב</h2>\n  \n<h2>גד]</h2>')
  })
  it('שורה ריקה לא מונעת הסרה (כל השורות שיש בהן טקסט כבר כותרת)', () => {
    assert.equal(toggle('<h2>[אב</h2>\n\n<h2>גד]</h2>', 'h2'), '[אב\n\nגד]')
    assert.equal(active('[<h2>אב</h2>\n\n<h2>גד</h2>]'), 'h2')
  })
  it('סמן על שורה ריקה — כותרת ריקה והסמן בתוכה; לחיצה נוספת מסירה', () => {
    const out = toggle('אב\n|\nגד', 'h2')
    assert.equal(out, 'אב\n<h2>|</h2>\nגד')
    assert.equal(toggle(out, 'h2'), 'אב\n|\nגד')
  })
  it('בחירה של שורות ריקות בלבד — בלי שינוי', () => {
    assert.equal(toggle('אב\n[\n]\nגד', 'h1'), 'אב\n[\n]\nגד')
  })
  it('שורה בתוך אלמנט שחוצה שורות — הקינון נשאר תקין', () => {
    assert.equal(toggle('<big>א|ב\nגד</big>', 'h1'), '<h1><big>א|ב</big></h1><big>\nגד</big>')
    assert.equal(toggle('<big>אב\nג|ד</big>', 'h1'), '<big>אב\n</big><h1><big>ג|ד</big></h1>')
    // תג סוגר בתחילת השורה (האלמנט נפתח בשורה קודמת) — נשאר מחוץ לכותרת
    assert.equal(toggle('<b>אב\n</b>ג|ד\nה', 'h1'), '<b>אב\n</b><h1>ג|ד</h1>\nה')
    assert.equal(toggle('א|ב<b>\nגד</b>', 'h1'), '<h1>א|ב</h1><b>\nגד</b>')
  })
})

describe('סמן בתוך אלמנט שהמילה ממשיכה אחריו', () => {
  it('<small>גד</small>. — לחיצה על small מסירה (לא עוטפת שוב)', () => {
    assert.equal(toggle('אב <small>ג|ד</small>. הו', 'small'), 'אב ג|ד. הו')
    assert.equal(toggle('אב <b>ג|ד</b>, הו', 'b'), 'אב ג|ד, הו')
  })
})

describe('בחירה של רווחים בלבד (QA P2-7)', () => {
  it('"נקה עיצוב" לא מפצל את התג ונשאר אידמפוטנטי', () => {
    assert.equal(clear('<b>אב[  ]גד</b>'), '<b>אב[  ]גד</b>')
    assert.equal(clear('<b><i>אב[ \n ]גד</i></b>'), '<b><i>אב[ \n ]גד</i></b>')
  })
  it('עיצוב על רווחים בלבד — בלי שינוי', () => {
    assert.equal(toggle('<b>אב[  ]גד</b>', 'b'), '<b>אב[  ]גד</b>')
    assert.equal(toggle('אב[  ]גד', 'i'), 'אב[  ]גד')
  })
})

// מאמת: כל פעולה (כל עיצוב, כל כותרת, נקה עיצוב), על כל טווח אפשרי בשדות בצורות שנמצאו בנתונים
// האמיתיים — שומרת על איזון התגים ולא מוסיפה שגיאות קינון. (הריצה על כל השדות האמיתיים —
// בסקריפט ה-fuzz של ה-QA, מחוץ לריפו; כאן — דגימה סינתטית של הצורות שלהם.)
describe('מאמת: כל פעולה שומרת על איזון התגים', () => {
  const VOID = new Set(['img', 'br', 'hr'])
  const balance = (raw) => {
    const m = {}
    for (const t of parseMarkup(raw).tags) {
      if (t.self || VOID.has(t.name)) continue
      m[t.name] = (m[t.name] || 0) + (t.closing ? -1 : 1)
    }
    return JSON.stringify(Object.entries(m).filter(([, v]) => v).sort())
  }
  const nestErrors = (raw) => {
    let e = 0
    const st = []
    for (const t of parseMarkup(raw).tags) {
      if (t.self || VOID.has(t.name)) continue
      if (!t.closing) st.push(t.name)
      else if (st[st.length - 1] === t.name) st.pop()
      else { e++; const j = st.lastIndexOf(t.name); if (j >= 0) st.length = j }
    }
    return e + st.length
  }
  const FIELDS = [
    'אב גד\n\nהו זח',
    '<h2>כותרת</h2>\n\nאב <b>גד</b>\n \n<h3>שנייה</h3>',
    '<big><b>אב גד</b>הו\nזח <b>טי כל</b>מ\nנס</big>',
    '<b>אב   גד</b> <i>הו</i>\n<small>זח</small>  ',
    '<b>אב\n</b>גד\nה<i>\nו</i>',
    'אב <span class="q">גד <b>הו</b></span>\n<img src="a.png">\n',
    '<b>א</b><b>ב</b>\n\n\n<u>ג</u>',
    '<h1><b>א </b>ב<b> ג</b></h1>\n\nד',
  ]
  const OPS = ['b', 'i', 'u', 'big', 'small', 'h1', 'h2', 'h3', 'clear']
  it('כל הטווחים × כל הפעולות', () => {
    for (const raw of FIELDS) {
      const bal = balance(raw)
      const nest = nestErrors(raw)
      for (let a = 0; a <= raw.length; a++) {
        for (let b = a; b <= raw.length; b++) {
          for (const op of OPS) {
            const out = op === 'clear' ? clearFormatting(raw, a, b) : toggleFormat(raw, a, b, op)
            const where = `${op} ${a}-${b} on ${JSON.stringify(raw)} → ${JSON.stringify(out.value)}`
            assert.equal(balance(out.value), bal, where)
            assert.ok(nestErrors(out.value) <= nest, where)
            assert.ok(!/<\/(h[1-3])><\1>/.test(out.value) || /<\/(h[1-3])><\1>/.test(raw), where)
          }
        }
      }
    }
  })
})
