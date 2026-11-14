'use client'

import Button from '@/components/ui/Button'
import CheckboxField from '@/components/plugins/form/CheckboxField'
import FormNote from '@/components/plugins/form/FormNote'
import { UPLOAD_FIELD_IDS, UPLOAD_REQUIRES_SERVICE_ID, type UploadPluginForm } from './useUploadPluginForm'

/**
 * סוף הטופס: אישור קבלת דיווחים (חובה), הערת "שים לב", ופעולה ראשית אחת — "העלה תוסף"
 * (filled, lg) — לצד "ביטול" (outlined). בנייד הכפתורים ברוחב מלא, הראשי למעלה.
 */
export default function UploadSubmitBar({ form }: { form: UploadPluginForm }) {
  return (
    <div className="space-y-5">
      {form.serviceEnabled && (
        <CheckboxField
          id={UPLOAD_REQUIRES_SERVICE_ID}
          checked={form.requiresService}
          onChange={form.setRequiresService}
          label="דורש שירות חיצוני"
          description="התוסף פועל מול תוכנה שמותקנת במחשב בנפרד. אחרי ההעלאה תועברו לדף הגשת השירות — מקור, מתקינים ופרטי זיהוי והסרה — והתוסף יפורסם רק יחד עם השירות, אחרי בחירת מנהל ובדיקות אבטחה."
        />
      )}

      <CheckboxField
        id={UPLOAD_FIELD_IDS.reportsConsent}
        checked={form.reportsConsent}
        onChange={form.setReportsConsent}
        required
        error={form.fieldErrors.reportsConsent}
        label="אני מאשר קבלת דיווחים ממשתמשים למייל שלי"
        description="(המייל איתו הינך רשום באתר, ניתן לשנותו בכל עת והוא לא מוצג למשתמשים)"
      />

      <FormNote>
        <strong className="font-semibold text-on-surface">שים לב:</strong> התוסף שלך יעבור בדיקה ואישור על ידי מנהל לפני שיופיע בחנות התוספים.
        {' '}תקבל הודעה כאשר התוסף יאושר או אם יש צורך בשינויים.
      </FormNote>

      <div className="flex flex-col gap-3 pt-1 sm:flex-row sm:items-center">
        <Button type="submit" variant="filled" size="lg" icon="upload" loading={form.loading} className="sm:min-w-60">
          {form.loading ? 'מעלה...' : 'העלה תוסף'}
        </Button>
        <Button href="/plugins" variant="outlined" size="lg">
          ביטול
        </Button>
      </div>
    </div>
  )
}
