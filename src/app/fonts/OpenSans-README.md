# Open Sans (גופן הקלדה "בלי תגים" בעורך העמוד)

- **קובץ:** `OpenSans-Variable.woff2` — גופן משתנה (wght 400–700, רוחב קבוע 100), כ-40KB.
- **מקור:** https://github.com/google/fonts/tree/main/ofl/opensans (`OpenSans[wdth,wght].ttf`;
  פרויקט https://github.com/googlefonts/opensans).
- **רישיון:** SIL Open Font License 1.1 — הנוסח המלא ב-`OFL-OpenSans.txt`. אין שם גופן שמור; הקובץ כאן
  חיתוך (instance + subset) בלבד, בלי שינוי בעיצוב האותיות.
- **כיסוי:** ניקוד (חסרים רפה U+05BF וסימנים נדירים), **בלי טעמים**. בשרשרת הגופנים (editorShellLogic.js)
  אחריו נוטו סנס עברי, כך שטעמים מוצגים בנוטו ולא כריבוע.
- **בלי preload:** נטען רק כשמשתמש בוחר בו בגיליון התצוגה של העורך.

## איך נוצר מחדש

```bash
pip install fonttools brotli
pyftsubset "OpenSans[wdth,wght].ttf" --layout-features='*' --unicodes="U+0307-0308,U+0590-05FF,U+200C-2010,U+20AA,U+25CC,U+FB1D-FB4F,U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD" --output-file=os-sub.ttf
fonttools varLib.instancer os-sub.ttf wdth=100 wght=400:700 -o os-inst.ttf
pyftsubset os-inst.ttf --flavor=woff2 --layout-features='*' --unicodes="U+0307-0308,U+0590-05FF,U+200C-2010,U+20AA,U+25CC,U+FB1D-FB4F,U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD" --output-file=OpenSans-Variable.woff2
```

ההצהרה (`weight: "400 700"`, `preload: false`, `--font-open-sans`) ב-`src/app/layout.tsx`.
