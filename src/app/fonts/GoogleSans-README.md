# Google Sans (גופן הקלדה "בלי תגים" בעורך העמוד)

- **קובץ:** `GoogleSans-Variable.woff2` — גופן משתנה (wght 400–700; opsz=18, GRAD=0 קבועים), כ-52KB.
- **מקור:** https://github.com/google/fonts/tree/main/ofl/googlesans (`GoogleSans[GRAD,opsz,wght].ttf`;
  פרויקט https://github.com/googlefonts/googlesans).
- **רישיון:** SIL Open Font License 1.1 (מ-2025) — הנוסח המלא ב-`OFL-GoogleSans.txt`. אין שם גופן שמור,
  ולכן מותר לחתוך. "Google" ו-"Google Sans" הם סימני מסחר (TRADEMARKS.md בתיקיית המקור): מותר לקרוא
  לגופן בשמו, בלי לרמוז על קשר או חסות של Google.
- **כיסוי:** ניקוד וטעמים מלאים (U+0591–05C7), עם מיקום סימנים (mark).
- **בלי preload:** נטען רק כשמשתמש בוחר בו בגיליון התצוגה של העורך.

## איך נוצר מחדש

```bash
pip install fonttools brotli
# חיתוך קודם ואז instance — הקובץ המלא (5MB, עשרות כתבים) איטי מאוד ל-instancer
pyftsubset "GoogleSans[GRAD,opsz,wght].ttf" --layout-features='*' --unicodes="U+0307-0308,U+0590-05FF,U+200C-2010,U+20AA,U+25CC,U+FB1D-FB4F,U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD" --output-file=gs-sub.ttf
fonttools varLib.instancer gs-sub.ttf opsz=18 GRAD=0 wght=400:700 -o gs-inst.ttf
pyftsubset gs-inst.ttf --flavor=woff2 --layout-features='*' --unicodes="U+0307-0308,U+0590-05FF,U+200C-2010,U+20AA,U+25CC,U+FB1D-FB4F,U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD" --output-file=GoogleSans-Variable.woff2
```

ההצהרה (`weight: "400 700"`, `preload: false`, `--font-google-sans`) ב-`src/app/layout.tsx`.
