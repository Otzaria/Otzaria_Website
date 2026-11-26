// submittedAt מזהה הגשה; reviewRevision משתנה גם כשאותה הגשה משתנה במקום
// (למשל סנכרון זרמים או ביטול תיקון). מסמכים מלפני השדה הם גרסה 0, בלי migration.
export const reviewRevision = (item) => item?.reviewRevision ?? 0;

export function reviewRevisionFilter(item) {
  const revision = reviewRevision(item);
  return { reviewRevision: revision === 0 ? { $in: [null, 0] } : revision };
}
