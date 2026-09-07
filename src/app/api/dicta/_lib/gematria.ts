// ============== Gematria / Hebrew-numeral text utilities ==============
// עוזרים כלליים לחישוב וזיהוי גימטריה, וניקוי תגיות HTML מטקסט — משמשים את
// כלי העריכה (editor-tools) לזיהוי מספרי דפים/כותרות.

const FINAL_MAP: Record<string, string> = {
  "ך": "כ",
  "ם": "מ",
  "ן": "נ",
  "ף": "פ",
  "ץ": "צ",
};

const LETTER_VALUES: Record<string, number> = {
  "א": 1,
  "ב": 2,
  "ג": 3,
  "ד": 4,
  "ה": 5,
  "ו": 6,
  "ז": 7,
  "ח": 8,
  "ט": 9,
  "י": 10,
  "כ": 20,
  "ל": 30,
  "מ": 40,
  "נ": 50,
  "ס": 60,
  "ע": 70,
  "פ": 80,
  "צ": 90,
  "ק": 100,
  "ר": 200,
  "ש": 300,
  "ת": 400,
};

export function toHebrew(num: number): string {
  if (num <= 0) return "";
  let remaining = num;
  let result = "";

  const hundreds = [
    [400, "ת"],
    [300, "ש"],
    [200, "ר"],
    [100, "ק"],
  ] as const;

  const tens = [
    [90, "צ"],
    [80, "פ"],
    [70, "ע"],
    [60, "ס"],
    [50, "נ"],
    [40, "מ"],
    [30, "ל"],
    [20, "כ"],
    [10, "י"],
  ] as const;

  const ones = [
    [9, "ט"],
    [8, "ח"],
    [7, "ז"],
    [6, "ו"],
    [5, "ה"],
    [4, "ד"],
    [3, "ג"],
    [2, "ב"],
    [1, "א"],
  ] as const;

  for (const [value, letter] of hundreds) {
    while (remaining >= value) {
      result += letter;
      remaining -= value;
    }
  }

  if (remaining === 15) {
    result += "טו";
    remaining = 0;
  } else if (remaining === 16) {
    result += "טז";
    remaining = 0;
  }

  for (const [value, letter] of tens) {
    while (remaining >= value) {
      result += letter;
      remaining -= value;
    }
  }

  for (const [value, letter] of ones) {
    while (remaining >= value) {
      result += letter;
      remaining -= value;
    }
  }

  return result;
}

export function toNumber(text: string): number {
  if (!text) return 0;
  let sum = 0;
  const clean = text
    .replace(/["׳״]/g, "")
    .replace(/[^א-ת]/g, "")
    .split("")
    .map((ch) => FINAL_MAP[ch] || ch);

  for (const ch of clean) {
    sum += LETTER_VALUES[ch] || 0;
  }

  return sum;
}

export function stripTags(text: string, tags: string[]) {
  let result = text;
  tags.forEach((tag) => {
    result = result.split(tag).join("");
  });
  return result;
}

export function isGematria(text: string, end: number): boolean {
  const remove = ["<b>", "</b>", "<big>", "</big>", ":", '"', ",", ";", "[", "]", "(", ")", "'", ".", "״", "‚"];
  const aa = ["ק", "ר", "ש", "ת", "תק", "תר", "תש", "תת", "תתק", "יה", "יו", "קיה", "קיו", "ריה", "ריו", "שיה", "שיו", "תיה", "תיו", "תקיה", "תקיו", "תריה", "תריו", "תשיה", "תשיו", "תתיה", "תתיו", "תתקיה", "תתקיו"];
  const bb = ["ם", "ן", "ץ", "ף", "ך"];
  const cc = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "ששי", "שביעי", "שמיני", "תשיעי", "עשירי", "יוד", "למד", "נון", "דש", "חי", "טל", "שדמ", "ער", "שדם", "תשדם", "תשדמ", "ערב", "ערה", "עדר", "רחצ"];
  const appendList = aa.flatMap((item) => bb.map((suffix) => item + suffix));

  let cleaned = text;
  remove.forEach((tag) => {
    cleaned = cleaned.split(tag).join("");
  });

  const withauteGershayim = Array.from({ length: end - 1 }, (_, i) => toHebrew(i + 1)).concat(bb, cc, appendList, aa);
  return withauteGershayim.includes(cleaned);
}
