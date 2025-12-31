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

EXPOSE 3000

CMD ["npm", "run", "dev"]