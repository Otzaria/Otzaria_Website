// סינון מקומי (בצד הלקוח) של רשימת "כל התוספים" — חולץ מ-src/app/plugins/all
// כדי שהלוגיקה תהיה ניתנת לבדיקה בנפרד מהקומפוננטה (ראו pluginFilter.test.mjs).
//
// שלושת התנאים הם AND: חיפוש חופשי (שם/תיאור קצר/תיאור מלא/תגית), סטטוס
// מדויק, ותגית מדויקת. 'all' משמעו "בלי סינון" עבור סטטוס/תגית.

export function filterPlugins(plugins, { searchQuery = '', statusFilter = 'all', activeTag = 'all' } = {}) {
  let filtered = plugins

  if (searchQuery) {
    const query = searchQuery.toLowerCase()
    filtered = filtered.filter(plugin =>
      plugin.name.toLowerCase().includes(query) ||
      plugin.shortDescription.toLowerCase().includes(query) ||
      plugin.description.toLowerCase().includes(query) ||
      plugin.tags?.some(tag => tag.toLowerCase().includes(query))
    )
  }

  if (statusFilter !== 'all') {
    filtered = filtered.filter(plugin => plugin.status === statusFilter)
  }

  if (activeTag !== 'all') {
    filtered = filtered.filter(plugin => plugin.tags?.includes(activeTag))
  }

  return filtered
}

// כל התגיות הקיימות ברשימת תוספים, ממוינות א"ב עברי — חולץ מאותו דף.
export function extractSortedTags(plugins) {
  const tags = new Set()
  plugins.forEach(plugin => {
    plugin.tags?.forEach(tag => tags.add(tag))
  })
  return Array.from(tags).sort((a, b) => a.localeCompare(b, 'he'))
}
