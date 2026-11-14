# Noto Sans Hebrew (גופן הקלדה "בלי תגים" בעורך העמוד)

- **קובץ:** `NotoSansHebrew-Variable.woff2` — גופן משתנה (wght 400–700, רוחב קבוע 100), כ-29KB.
- **מקור:** https://github.com/google/fonts/tree/main/ofl/notosanshebrew (`NotoSansHebrew[wdth,wght].ttf`;
  פרויקט https://github.com/notofonts/hebrew).
- **רישיון:** SIL Open Font License 1.1 — הנוסח המלא ב-`OFL-NotoSansHebrew.txt`. הקובץ כאן הוא חיתוך
  (instance + subset) בלבד, בלי שינוי בעיצוב האותיות ובלי שינוי שם.
- **למה הוא:** בין גופני ה-sans העבריים החופשיים רק הוא מכסה את כל הטעמים (U+0591–05AF) ואת כל
  סימני הניקוד; ב-Heebo, ‏Rubik ו-Assistant אין טעמים כלל.
- **בלי preload:** נטען רק כשמשתמש בוחר בו בגיליון התצוגה של העורך.

## איך נוצר מחדש

```bash
pip install fonttools brotli
fonttools varLib.instancer "NotoSansHebrew[wdth,wght].ttf" wdth=100 wght=400:700 -o noto-inst.ttf
pyftsubset noto-inst.ttf --flavor=woff2 --layout-features='*' \
  --unicodes="U+0307-0308,U+0590-05FF,U+200C-2010,U+20AA,U+25CC,U+FB1D-FB4F,U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD" \
  --output-file=NotoSansHebrew-Variable.woff2
```

ההצהרה (`weight: "400 700"`, `preload: false`, `--font-noto-hebrew`) ב-`src/app/layout.tsx`.
