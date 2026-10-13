// סינון מקומי (בצד הלקוח) של רשימת "כל התוספים" — חולץ מ-src/app/plugins/all
// כדי שהלוגיקה תהיה ניתנת לבדיקה בנפרד מהקומפוננטה (ראו pluginFilter.test.mjs).
//
// ארבעת התנאים הם AND: חיפוש חופשי (שם/תיאור קצר/תיאור מלא/תגית), סטטוס
// מדויק, תגית מדויקת ופלטפורמה. 'all' משמעו "בלי סינון". בסינון פלטפורמה,
// תוסף שלא הצהיר על platforms נחשב זמין בכולן (ראו pluginPlatforms.js).

import { pluginSupportsPlatform } from './pluginPlatforms.js'

export function filterPlugins(plugins, { searchQuery = '', statusFilter = 'all', activeTag = 'all', platformFilter = 'all' } = {}) {
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

  if (platformFilter !== 'all') {
    filtered = filtered.filter(plugin => pluginSupportsPlatform(plugin, platformFilter))
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
