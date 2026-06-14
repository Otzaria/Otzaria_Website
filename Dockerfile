FROM node:20-alpine

# התקנת כלי מערכת (זה יורד פעם אחת ונשמר במטמון)
RUN apk add --no-cache \
    graphicsmagick \
    ghostscript \
    libc6-compat \
    python3 \
    make \
    g++

WORKDIR /app

# שלב חכם: מעתיקים רק את הקובץ שמגדיר את החבילות
COPY package.json package-lock.json* ./

# מתקינים חבילות. דוקר "זוכר" את השלב הזה.
# אם לא שינית את package.json, הוא ידלג על ההורדה הזו בפעם הבאה!
RUN npm install

# רק עכשיו מעתיקים את שאר הקוד
COPY . .

# הערת אבטחה: ה-image הזה רץ כ-root ב-dev (CMD = npm run dev) כי docker-compose
# ממפה bind-mount של ./:/app ו-anon volume ל-/app/.next; הרצה כ-USER node כאן
# שוברת את הכתיבה ל-.next (EACCES). הקשחת least-privilege שייכת ל-build פרודקשן
# נפרד (multi-stage: next build → next start, ללא bind mounts) שירוץ כ-USER node.

EXPOSE 3000

CMD ["npm", "run", "dev"]