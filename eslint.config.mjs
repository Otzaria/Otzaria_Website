import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next"; // <-- התיקון כאן: שינינו מ-otzaria ל-next
import nextTs from "eslint-config-next/typescript";
import pluginSecurity from "eslint-plugin-security";

const eslintConfig = defineConfig([
  nextVitals, // <-- שינינו מ-...nextVitals (כי זה לא מערך בגרסה הזו)
  ...nextTs,
  pluginSecurity.configs.recommended,

  // כיבוי כללי אבטחה רועשים (false-positives ברובם המוחלט בקוד שרת לגיטימי).
  // נשמרים detect-unsafe-regex ו-detect-possible-timing-attacks שתופסים בעיות אמיתיות.
  {
    rules: {
      "security/detect-object-injection": "off",
      "security/detect-non-literal-fs-filename": "off",
      "security/detect-non-literal-regexp": "off",
      // מרכאות/גרשיים בעברית בתוך טקסט JSX אינן בעיה — כלל סגנוני שמיותר באתר תוכן עברי.
      "react/no-unescaped-entities": "off",
      // לא לסמן binding לא-בשימוש ב-catch (תקני ומקובל), ולתמוך בקונבנציית '_' למשתנה זרוק.
      "@typescript-eslint/no-unused-vars": ["warn", {
        argsIgnorePattern: "^_",
        varsIgnorePattern: "^_",
        caughtErrors: "none",
        // דפוס השמטת שדות רגישים: const { password, ...safe } = user — השדות המושמטים מכוונים.
        ignoreRestSiblings: true,
      }],
      // הרמז של next/image לא מתאים כאן: רוב התמונות דינמיות/תוכן-משתמש (עמודי ספרים, OCR,
      // אייקוני תוספים, אווטרים) או SVG — next/image דורש קונפיג מקור ומידות קבועות ומסכן פריסה.
      "@next/next/no-img-element": "off",
    },
  },

  // Override default ignores of eslint-config-next.
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // סקריפטי Node תחזוקה (CommonJS) — לא חלק מאפליקציית Next.js.
    "scripts/**",
  ]),
]);

export default eslintConfig;