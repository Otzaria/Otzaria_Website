// שומרים רק תמונות/Forms ששמותיהם מופיעים בתוכן העמודים שנבחרו או בתלויות שלהם.
// השמות נאספים בכוונה מכל תחומי המשאבים: עדיף לשמור משאב נוסף בעל אותו שם מאשר להסיר
// תמונה שבשימוש Form, דוגמה מרוצפת, גליף Type3 או מראה הערה. תוכן שלא ניתן לפענח נשמר בשלמותו.

const whitespace = (c) => c === 0 || c === 9 || c === 10 || c === 12 || c === 13 || c === 32
const delimiter = (c) => whitespace(c) || '()<>[]{}/%'.includes(String.fromCharCode(c))

function contentNames(bytes) {
  const names = new Set()
  const brackets = []
  let i = 0
  while (i < bytes.length) {
    const c = bytes[i++]
    if (whitespace(c)) continue
    if (c === 37) { // הערה
      while (i < bytes.length && bytes[i] !== 10 && bytes[i] !== 13) i++
    } else if (c === 40) { // מחרוזת, כולל סוגריים מקוננים ותווי מילוט
      let depth = 1
      while (i < bytes.length && depth) {
        const next = bytes[i++]
        if (next === 92) i++
        else if (next === 40) depth++
        else if (next === 41) depth--
      }
      if (depth) return null
    } else if (c === 60 && bytes[i] !== 60) { // מחרוזת הקסדצימלית
      while (i < bytes.length && bytes[i] !== 62) i++
      if (i === bytes.length) return null
      i++
    } else if (c === 60 && bytes[i] === 60) {
      i++ // פתיחת מילון
      brackets.push(c)
    } else if (c === 91) {
      brackets.push(c)
    } else if (c === 93) {
      if (brackets.pop() !== 91) return null
    } else if (c === 62) {
      if (bytes[i++] !== 62 || brackets.pop() !== 60) return null
    } else if (c === 41 || c === 123 || c === 125) {
      return null
    } else if (c === 47) {
      let name = ''
      while (i < bytes.length && !delimiter(bytes[i])) {
        const next = bytes[i++]
        if (next === 35) {
          const hex = String.fromCharCode(bytes[i++], bytes[i++])
          if (!/^[\da-f]{2}$/i.test(hex)) return null
          name += String.fromCharCode(parseInt(hex, 16))
        } else name += String.fromCharCode(next)
      }
      names.add(name)
    } else if (!delimiter(c)) {
      let word = String.fromCharCode(c)
      while (i < bytes.length && !delimiter(bytes[i])) word += String.fromCharCode(bytes[i++])
      // אי אפשר לדלג בבטחה על תמונה מוטבעת באמצעות חיפוש EI בתוך הנתונים הבינאריים.
      if (word === 'BI') return null
    }
  }
  return brackets.length ? null : names
}

function resourceReplacements(source, indices, lib) {
  const { PDFArray, PDFDict, PDFName, PDFStream, decodePDFRawStream } = lib
  const names = new Set()
  const xobjects = new Set()
  const visited = new Map()
  const examined = new Set()
  let unsafe = false
  const resolve = (value) => source.context.lookup(value)
  const get = (dict, key) => resolve(dict.get(PDFName.of(key)))
  const decode = (stream) => {
    // מפענח הזרמים של pdf-lib אינו מחיל Predictor; פענוח חלקי עלול להסתיר שם משאב.
    const parameters = get(stream.dict, 'DecodeParms')
    const steps = parameters instanceof PDFArray ? parameters.asArray().map(resolve) : [parameters]
    for (const step of steps) {
      const predictor = step instanceof PDFDict && get(step, 'Predictor')
      if (predictor && predictor.asNumber?.() !== 1) throw new Error('חיזוי תוכן אינו נתמך בחילוץ משאבים')
    }
    return stream instanceof lib.PDFRawStream
      ? decodePDFRawStream(stream).decode()
      : stream.getUnencodedContents()
  }
  const scan = (bytes) => {
    const found = contentNames(bytes)
    if (!found) unsafe = true
    else for (const name of found) names.add(name)
  }

  const visit = (value, content = false) => {
    const object = resolve(value)
    if (!object || unsafe) return
    const flag = content ? 2 : 1
    if ((visited.get(object) || 0) & flag) return
    visited.set(object, (visited.get(object) || 0) | flag)
    if (object instanceof PDFArray) {
      for (const item of object.asArray()) visit(item, content)
    } else if (object instanceof PDFStream) {
      const subtype = get(object.dict, 'Subtype')
      if (content || subtype === PDFName.of('Form') || get(object.dict, 'Resources') || get(object.dict, 'PatternType')?.asNumber?.() === 1) {
        try { scan(decode(object)) } catch { unsafe = true }
      }
      visit(object.dict)
    } else if (object instanceof PDFDict) {
      for (const [key, item] of object.entries()) {
        if (key === PDFName.of('XObject')) {
          const entries = resolve(item)
          if (entries instanceof PDFDict) xobjects.add(entries)
          else unsafe = true
        } else visit(item, content || key === PDFName.of('CharProcs'))
      }
    }
  }

  for (const index of indices) {
    const page = source.getPage(index)
    visit(page.node.Resources())
    const contents = resolve(page.node.Contents())
    if (contents) {
      // מערך Contents הוא זרם לוגי אחד — גם שם משאב יכול להתחלק בין זרמים.
      const streams = contents instanceof PDFArray ? contents.asArray().map(resolve) : [contents]
      try {
        const chunks = streams.map(decode)
        const bytes = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.length, 0))
        let offset = 0
        for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length }
        scan(bytes)
        for (const stream of streams) visit(stream.dict)
      } catch { unsafe = true }
    }
    // מראה של הערה יכול להשתמש במשאבים משלו או של העמוד.
    const annotations = resolve(page.node.Annots())
    if (annotations instanceof PDFArray) {
      for (const entry of annotations.asArray()) {
        const annotation = resolve(entry)
        if (annotation instanceof PDFDict) visit(get(annotation, 'AP'), true)
      }
    }
  }

  // שמות מתוך Form שבשימוש יכולים להוביל ל-Forms ולמילוני משאבים נוספים.
  let progress = true
  while (progress && !unsafe) {
    progress = false
    for (const dict of xobjects) {
      for (const [name, value] of dict.entries()) {
        if (!names.has(name.decodeText()) || examined.has(value)) continue
        examined.add(value)
        progress = true
        const object = resolve(value)
        const subtype = object instanceof PDFStream && get(object.dict, 'Subtype')
        if (subtype !== PDFName.of('Image') && subtype !== PDFName.of('Form')) unsafe = true
        else visit(object)
      }
    }
  }

  const replacements = new Map()
  if (!unsafe) {
    for (const dict of xobjects) {
      const reduced = dict.clone()
      for (const key of dict.keys()) if (!names.has(key.decodeText())) reduced.delete(key)
      if (reduced.keys().length !== dict.keys().length) replacements.set(dict, reduced)
    }
  }
  return replacements
}

export async function copySelectedPdfPages(source, destination, indices, lib) {
  await source.flush()
  const replacements = resourceReplacements(source, indices, lib)
  const copier = lib.PDFObjectCopier.for(source.context, destination.context)
  const copy = copier.copy
  // PDFObjectCopier קורא רקורסיבית לפונקציית copy הציבורית שלו. מחליפים מילוני משאבים רק בעותק:
  // מסמך המקור שבמטמון והמשאבים המשותפים שלו לא משתנים, גם בחיתוכים חוזרים.
  copier.copy = (object) => copy(replacements.get(object) || object)
  for (const index of indices) {
    const node = copier.copy(source.getPage(index).node)
    const ref = destination.context.register(node)
    destination.addPage(lib.PDFPage.of(node, ref, destination))
  }
}
