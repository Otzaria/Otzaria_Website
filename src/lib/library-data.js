export const statusConfig = {
  completed: {
    label: 'הושלם',
    color: 'text-success-700',
    bgColor: 'bg-success-100',
    borderColor: 'border-success-300',
    icon: 'check_circle'
  },
  'in-progress': {
    label: 'בטיפול',
    color: 'text-info-700',
    bgColor: 'bg-info-100',
    borderColor: 'border-info-300',
    icon: 'edit'
  },
  available: {
    label: 'זמין לעריכה',
    color: 'text-neutral-700',
    bgColor: 'bg-neutral-100',
    borderColor: 'border-neutral-300',
    icon: 'description'
  }
}

// פונקציה לחיפוש בעץ
export function searchInTree(tree, searchTerm) {
  if (!searchTerm) return tree
  
  const results = []
  
  function search(items, path = []) {
    items.forEach(item => {
      const currentPath = [...path, item.name]
      
      if (item.name.toLowerCase().includes(searchTerm.toLowerCase())) {
        results.push({ ...item, path: currentPath })
      }
      
      if (item.children) {
        search(item.children, currentPath)
      }
    })
  }
  
  search(tree)
  return results
}