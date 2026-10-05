import mongoose from 'mongoose';

// טיוטה של עמוד בהגהת-עמודים — בשרת (lib/pageProof/serverDrafts.js; הכללים הטהורים — draftRules.js).
// **טיוטה אחת לעמוד** (לא לכל מתנדב): עמוד שעובר למתנדב אחר (התפיסה פגה, או מנהל שחרר) מגיע עם העבודה שנעשתה בו,
// ומתנדב ממשיך ממחשב אחר. רק מי שמחזיק עכשיו בעמוד כותב (PUT /api/page-proof/pages/[id]/draft); הגשה מוחקת אותה.
//
// ops — רשימת-העבודה של העורך (useProofEditor) אחרי ניקוי: פעולות-חוזה תקינות מול העמוד בגרסה הזו, וחצאי-האישור
// המקומיים (seg_ok, _local). stage — השלב בדף המתנדב ('structure' / 'text'; ריק = טיוטה מלפני השלבים ← 'text').
// inherited — מה שהתקבל ממישהו אחר ומסומן בעורך: {source: 'submission' (הבודק השני) | 'approved' (עמוד שנפתח מחדש
// בידי מנהל) | 'draft' (העמוד עבר ממתנדב אחר), submissionId, byName, at, ops}. carried — העמוד חזר מזיהוי-מחדש
// והטיוטה עברה לגרסה החדשה (drafts.carryDraftOps): {from, kept, cut, dropped:[תיאורים]}. recut — נשלח לזיהוי-מחדש
// משלב "מבנה" ({sentAt, backAt}).
const PageProofDraftSchema = new mongoose.Schema(
  {
    page: { type: mongoose.Schema.Types.ObjectId, ref: 'PageProofPage', required: true },
    gid: { type: String, default: '' },
    pageNo: { type: Number, default: 0 },
    // גרסת-העמוד שהפעולות מתייחסות לשורות שלה (PageProofPage.revision)
    revision: { type: Number, default: 1 },
    // חתימת-העמוד (textModel.docRevision — מזהי-השורות והגודל) שהפעולות נעשו מולה: עדכון-עמוד מתוכנת-הספר שומר את
    // מספר-הגרסה ומחליף מזהים — חתימה אחרת ← הטיוטה עוברת לעמוד כפי שהוא עכשיו (serverDrafts.editorDraft)
    sig: { type: String, default: '' },
    ops: { type: [mongoose.Schema.Types.Mixed], default: [] },
    opCount: { type: Number, default: 0 },
    stage: { type: String, enum: ['structure', 'text', null], default: null },
    by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    byName: { type: String, default: '' },
    inherited: { type: mongoose.Schema.Types.Mixed, default: null },
    carried: { type: mongoose.Schema.Types.Mixed, default: null },
    recut: { type: mongoose.Schema.Types.Mixed, default: null },
  },
  { timestamps: true }
);

PageProofDraftSchema.index({ page: 1 }, { unique: true });
PageProofDraftSchema.index({ gid: 1, pageNo: 1 });

export default mongoose.models.PageProofDraft || mongoose.model('PageProofDraft', PageProofDraftSchema);
