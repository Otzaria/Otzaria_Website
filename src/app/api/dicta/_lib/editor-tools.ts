import { load as loadHtml } from "cheerio";
import { getBookContent, saveBookContent, getBookLines, saveBookLines } from "./book-content";
import { isGematria, stripTags, toNumber } from "./gematria";

// ============== MongoDB-Based Editor Tool Functions ==============
// כלי העריכה של דיקטה: פעולות אוטומטיות על תוכן ספר (זיהוי כותרות, ניקוד,
// ניקוי טקסט, בדיקת שגיאות תגיות/כותרות) — כל אחת קוראת/כותבת תוכן ספר
// דרך book-content.ts ומשתמשת בעוזרי גימטריה מ-gematria.ts.

export async function addPageNumberToHeadingDB(bookId: string, replaceWith: string) {
  const content = await getBookLines(bookId);
  let changesMade = false;
  const updated: string[] = [];
  let i = 0;

  while (i < content.length) {
    const line = content[i];
    const match = line.match(/<h([2-9])>(דף \S+)<\/h\1>/);
    if (match) {
      const level = match[1];
      const title = match[2];
      const nextLineIndex = i + 1;
      if (nextLineIndex < content.length) {
        const nextLine = content[nextLineIndex].trim();
        // נבדק: לינארי — כמתים חד-רמתיים, אין נסיגה קטסטרופלית
        // eslint-disable-next-line security/detect-unsafe-regex
        const pattern = /(<[a-z]+>)?(ע["']+?[אב]|עמוד [אב])[.,:()\[\]'"״׳]?(<\/[a-z]+>)?\s?/;
        const matchNextLine = nextLine.match(pattern);
        if (matchNextLine) {
          changesMade = true;
          let newTitle = line;
          if (replaceWith === "נקודה ונקודותיים") {
            if (matchNextLine[2].includes("א")) {
              newTitle = `<h${level}>${title.replace(/\.+$/, "")}.<\/h${level}>`;
            } else {
              newTitle = `<h${level}>${title.replace(/\.+$/, "")}:<\/h${level}>`;
            }
          } else if (replaceWith === "ע\"א וע\"ב") {
            const suffix = matchNextLine[2].includes("א") ? "ע\"א" : "ע\"ב";
            newTitle = `<h${level}>${title.replace(/\.+$/, "")} ${suffix}<\/h${level}>`;
          }
          updated.push(newTitle);
          // הערת אבטחה: false positive מאומת עבור התראת CodeQL js/incomplete-multi-character-sanitization (נסגרה ידנית ב-GitHub, ראו הסבר): `pattern`
          // strips a specific Hebrew page-reference marker (e.g. ע"א/ע"ב), not arbitrary
          // HTML — the optional tag-wrapper groups are incidental. Book content is sanitized
          // with DOMPurify wherever it's rendered as HTML (see DictaEditorCore.jsx).
          const modifiedNext = nextLine.replace(pattern, "").trim();
          if (modifiedNext !== "") updated.push(modifiedNext);
          i += 1;
        } else {
          updated.push(line);
        }
      } else {
        updated.push(line);
      }
    } else {
      updated.push(line);
    }
    i += 1;
  }

  if (changesMade) {
    await saveBookLines(bookId, updated);
    return { changed: true, message: "ההחלפה הושלמה בהצלחה!" };
  }
  return { changed: false, message: "אין מה להחליף בקובץ זה" };
}

export async function changeHeadingLevelDB(bookId: string, currentLevel: string, newLevel: string) {
  const content = await getBookContent(bookId);
  const currentTag = `h${currentLevel}`;
  const newTag = `h${newLevel}`;
  const currentPattern = currentTag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const newPattern = newTag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const updated = content.replace(new RegExp(`<${currentPattern}>(.*?)<\\/${currentPattern}>`, "gs"), `<${newPattern}>$1</${newPattern}>`);
  if (content === updated) return { changed: false, message: "אין מה להחליף בקובץ זה" };
  await saveBookContent(bookId, updated);
  return { changed: true, message: "רמות הכותרות עודכנו בהצלחה!" };
}

export async function createHeadersDB(bookId: string, findWord: string, end: number, levelNum: number) {
  let found = false;
  let countHeadings = 0;
  const htmlTags = ["<b>", "</b>", "<big>", "</big>", ":", '"', ",", ";", "[", "]", "(", ")", "'", "״", ".", "‚"];
  const findClean = stripTags(findWord, htmlTags).trim();
  const content = await getBookLines(bookId);
  const allLines: string[] = content.slice(0, 2);
  let i = 2;
  while (i < content.length) {
    const line = content[i];
    const words = line.split(/\s+/).filter(Boolean);
    try {
      if (words.length >= 2 && stripTags(words[0], htmlTags) === findClean && isGematria(stripTags(words[1], htmlTags), end + 1)) {
        found = true;
        countHeadings += 1;
        const headingLine = `<h${levelNum}>${stripTags(words[0], htmlTags)} ${stripTags(words[1], htmlTags)}<\/h${levelNum}>`;
        allLines.push(headingLine);
        if (words.slice(2).length) allLines.push(words.slice(2).join(" "));
      } else if (words.length === 1 && stripTags(words[0], htmlTags) === findClean && i + 1 < content.length) {
        const nextLine = content[i + 1];
        const nextWords = nextLine.split(/\s+/).filter(Boolean);
        if (nextWords.length >= 1 && isGematria(stripTags(nextWords[0], htmlTags), end + 1)) {
          found = true;
          countHeadings += 1;
          const headingLine = `<h${levelNum}>${stripTags(words[0], htmlTags)} ${stripTags(nextWords[0], htmlTags)}<\/h${levelNum}>`;
          allLines.push(headingLine);
          if (nextWords.slice(1).length) allLines.push(nextWords.slice(1).join(" "));
          i += 1;
        } else {
          allLines.push(line);
        }
      } else {
        allLines.push(line);
      }
    } catch {
      allLines.push(line);
    }
    i += 1;
  }

  await saveBookLines(bookId, allLines);
  if (findWord === "דף") {
    await addPageNumberToHeadingDB(bookId, "נקודה ונקודותיים");
  }

  return { found, count: countHeadings };
}

export async function createSingleLetterHeadersDB(
  bookId: string,
  start: string,
  endSuffix: string,
  end: number,
  levelNum: number,
  ignore: string[],
  remove: string[],
  boldOnly: boolean
) {
  let count = 0;
  let localEndSuffix = endSuffix;
  let localStart = start;
  let localIgnore = [...ignore];
  const fixedRemoveTags = ["<b>", "</b>", "<big>", "</big>", "<i>", "</i>", "</small>", "<span>", "</span>", "<br>", "</br>", "<p>", "</p>"];
  const fullRemove = fixedRemoveTags.concat(remove);

  if (boldOnly) {
    localEndSuffix += "</b>";
    localStart = `<b>${localStart}`;
  } else {
    localIgnore = localIgnore.concat(["<b>", "</b>"]);
  }

  const stripHtml = (text: string, ignoreTags: string[]) => {
    let result = text;
    ignoreTags.forEach((tag) => {
      result = result.split(tag).join("");
    });
    return result;
  };

  const content = await getBookLines(bookId);
  const allLines: string[] = content.slice(0, 1);
  for (const line of content.slice(1)) {
    const words = line.split(/\s+/).filter(Boolean);
    try {
      const strippedFirstWord = stripHtml(words[0], localIgnore);

      if (
        strippedFirstWord.endsWith(localEndSuffix) &&
        strippedFirstWord.startsWith(localStart)
      ) {
        let textForGematria = strippedFirstWord;
        if (localStart && textForGematria.startsWith(localStart)) {
          textForGematria = textForGematria.slice(localStart.length);
        }
        if (localEndSuffix && textForGematria.endsWith(localEndSuffix)) {
          textForGematria = textForGematria.slice(0, -localEndSuffix.length);
        }
        textForGematria = textForGematria.replace(/<\/?b>/g, "");

        if (!isGematria(textForGematria, end + 1)) {
          allLines.push(line);
          continue;
        }

        const cleanWord = stripHtml(words[0], fullRemove);
        const headingLine = `<h${levelNum}>${cleanWord}<\/h${levelNum}>`;
        allLines.push(headingLine);
        if (words.slice(1).length) allLines.push(words.slice(1).join(" "));
        count += 1;
      } else {
        allLines.push(line);
      }
    } catch {
      allLines.push(line);
    }
  }

  await saveBookLines(bookId, allLines);
  return { count };
}

export async function createPageBHeadersDB(bookId: string, headerLevel: number) {
  const buildTagAgnosticPattern = (word: string, optionalEndChars = "['\"']*") => {
    const anyTags = "(?:<[^>]+>\\s*)*";
    let pattern = "";
    for (const char of word) {
      pattern += anyTags + char.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    }
    pattern += anyTags;
    if (optionalEndChars) pattern += optionalEndChars + anyTags;
    return pattern;
  };

  const stripAndReplace = (text: string, counter: { count: number }) => {
    const anyTags = "(?:<[^>]+>\\s*)*";
    const nonWord = "(?:[^\\w<>]|$)";
    let pattern = "^\\s*" + anyTags;

    const shemPattern = buildTagAgnosticPattern("שם", "");
    pattern += `(?<shem>${shemPattern}\\s*)?`;

    const gmarahVariants = ["גמרא", "בגמרא", "גמ'", "בגמ'"];
    const gmarahPatterns = gmarahVariants.map((word) => buildTagAgnosticPattern(word, ""));
    const gmarahPattern = `(?<gmarah>${gmarahPatterns.join("|")})\\s*`;
    pattern += `(?:${gmarahPattern})?`;

    const abVariants = ["עמוד ב", "ע\"ב", "ע''ב", "ע'ב"];
    const abPatterns = abVariants.map((word) => `(?<!\\w)${buildTagAgnosticPattern(word)}(?!\\w)`);
    const abPattern = `(?<ab>${abPatterns.join("|")})`;
    pattern += abPattern + nonWord + `(?<rest>.*)`;

    const matchPattern = new RegExp(pattern, "iu");

    const replaceFunction = (match: RegExpExecArray & { groups?: Record<string, string> }) => {
      const header = `<h${headerLevel}>עמוד ב<\/h${headerLevel}>`;
      const restOfLine = (match.groups?.rest || "").trimStart();
      let gmarahText = match.groups?.gmarah || "";
      if (gmarahText) gmarahText = gmarahText.replace(new RegExp(anyTags, "g"), "").trim();
      counter.count += 1;
      if (gmarahText) {
        return restOfLine ? `${header}\n${gmarahText} ${restOfLine}\n` : `${header}\n${gmarahText}\n`;
      }
      return restOfLine ? `${header}\n${restOfLine}\n` : `${header}\n`;
    };

    if (/<h\d>.*?<\/h\d>/i.test(text)) return text;
    const match = matchPattern.exec(text);
    if (!match) return text;
    const replaced = replaceFunction(match);
    return replaced.replace(/\n\s*\n/g, "\n");
  };

  const lines = await getBookLines(bookId);
  const counter = { count: 0 };
  const newLines = lines.map((line) => stripAndReplace(line, counter));
  await saveBookLines(bookId, newLines);

  return { count: counter.count };
}

export async function replacePageBHeadersDB(bookId: string, replaceType: string) {
  const content = await getBookContent(bookId);

  let previousTitle = "";
  let previousLevel = "";
  let replacementsMade = 0;

  const updated = content.replace(/<h([1-9])>(.*?)<\/h\1>/g, (match, level, title) => {
    if (/^דף \S+\.?/.test(title)) {
      previousTitle = title.trim();
      previousLevel = level;
      return match;
    }
    if (title === "עמוד ב") {
      replacementsMade += 1;
      if (replaceType === "נקודותיים") {
        return `<h${previousLevel}>${previousTitle.replace(/\.+$/, "")}:<\/h${previousLevel}>`;
      }
      if (replaceType === "ע\"ב") {
        const modifiedTitle = previousTitle.replace(/( ע\"א| עמוד א)/, "");
        return `<h${previousLevel}>${modifiedTitle.replace(/\.+$/, "")} ע\"ב<\/h${previousLevel}>`;
      }
    }
    return match;
  });

  await saveBookContent(bookId, updated);
  return { count: replacementsMade };
}

export async function emphasizeAndPunctuateDB(bookId: string, addEnding: string, emphasizeStart: boolean) {
  const lines = await getBookLines(bookId);
  let changed = false;

  for (let i = 0; i < lines.length; i += 1) {
    let line = lines[i].replace(/\r$/, "");
    const words = line.split(/\s+/).filter(Boolean);
    if (words.length > 10 && !Array.from({ length: 8 }, (_, idx) => idx + 2).some((n) => line.startsWith(`<h${n}>`))) {
      if (addEnding !== "ללא שינוי") {
        if (line.endsWith(",")) {
          line = line.replace(/,\s*$/, "");
          line += addEnding === "הוסף נקודה" ? "." : ":";
          changed = true;
        } else if (!/[\.!?:]$/.test(line) && !["</small>", "</big>", "</b>"].some((tag) => line.endsWith(tag))) {
          line += addEnding === "הוסף נקודה" ? "." : ":";
          changed = true;
        }
      }
      if (emphasizeStart) {
        const firstWord = words[0];
        if (!["<b>", "<small>", "<big>", "<h2>", "<h3>", "<h4>", "<h5>", "<h6>"].some((tag) => firstWord.includes(tag))) {
          if (!(firstWord.startsWith("<") && firstWord.endsWith(">"))) {
            line = `<b>${firstWord}</b> ${words.slice(1).join(" ")}`;
            changed = true;
          }
        }
      }
      lines[i] = line;
    }
  }

  if (changed) await saveBookLines(bookId, lines);
  return { changed };
}

export async function textCleanerDB(bookId: string, options: Record<string, boolean>) {
  let text = await getBookContent(bookId);
  const original = text;

  if (options.remove_empty_lines) text = text.replace(/\n\s*\n/g, "\n");
  if (options.remove_double_spaces) text = text.replace(/ +/g, " ");
  if (options.remove_spaces_before) text = text.replace(/[ \t]+([\)\],\.:])/g, "$1");
  if (options.remove_spaces_after) text = text.replace(/(\s|^)([\[\(])(\s+)/gm, "$1$2");
  if (options.remove_spaces_around_newlines) text = text.replace(/\s*\n\s*/g, "\n");
  if (options.replace_double_quotes) {
    text = text.replace(/''/g, '"').replace(/``/g, '"').replace(/''/g, '"').replace(/׳׳/g, '"').replace(/''/g, '"');
  }
  if (options.normalize_quotes) {
    text = text
      .replace(/[""„]/g, '"')
      .replace(/[''`]/g, "'")
      .replace(/׳/g, "'");
  }

  text = text.replace(/\s+$/, "");
  if (text === original) return { changed: false };
  await saveBookContent(bookId, text);
  return { changed: true };
}

function escapeRegExpHelper(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function headerErrorCheckerDB(bookId: string, reStart: string, reEnd: string, gershayim: boolean, isShas: boolean) {
  const htmlContent = await getBookContent(bookId);
  const lines = htmlContent.split(/\r?\n/);

  const openingWithoutClosing: string[] = [];
  const closingWithoutOpening: string[] = [];
  const headingErrors: string[] = [];

  const checkTags = (line: string, lineNumber: number) => {
    const allTags: Array<["open" | "close", string, number]> = [];
    const regex = /<(\/?\w+)>/g;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(line)) !== null) {
      const tag = match[1];
      const position = match.index;
      if (tag.startsWith("/")) {
        allTags.push(["close", tag.slice(1), position]);
      } else {
        allTags.push(["open", tag, position]);
      }
    }
    allTags.sort((a, b) => a[2] - b[2]);
    const openStack: string[] = [];
    for (const [tagType, tagName] of allTags) {
      if (tagType === "open") {
        openStack.push(tagName);
      } else {
        let found = false;
        for (let i = openStack.length - 1; i >= 0; i -= 1) {
          if (openStack[i] === tagName) {
            openStack.splice(i, 1);
            found = true;
            break;
          }
        }
        if (!found) closingWithoutOpening.push(`שורה ${lineNumber}: </${tagName}> || ${line.trim()}`);
      }
    }
    openStack.forEach((tag) => openingWithoutClosing.push(`שורה ${lineNumber}: <${tag}> || ${line.trim()}`));
  };

  const checkHeadingErrors = (line: string, lineNumber: number) => {
    ["h2", "h3", "h4", "h5", "h6"].forEach((tag) => {
      const headingPattern = new RegExp(`<${tag}>.*?<\/${tag}>`);
      const headingMatch = line.match(headingPattern);
      if (headingMatch) {
        const start = headingMatch.index || 0;
        const end = start + headingMatch[0].length;
        const before = line.slice(0, start).trim();
        const after = line.slice(end).trim();
        if (before || after) headingErrors.push(`שורה ${lineNumber}: ${line.trim()}`);
      }
    });
  };

  lines.forEach((line, idx) => {
    checkTags(line, idx + 1);
    checkHeadingErrors(line, idx + 1);
  });

  const $ = loadHtml(htmlContent);
  let pattern: RegExp;
  if (reStart && reEnd) {
    pattern = new RegExp(`^[${escapeRegExpHelper(reStart)}]*[א-ת]([א-ת \\-]*[א-ת])?[${escapeRegExpHelper(reEnd)}]*$`);
  } else if (reStart) {
    pattern = new RegExp(`^[${escapeRegExpHelper(reStart)}]*[א-ת]([א-ת \\-]*[א-ת])?$`);
  } else if (reEnd) {
    pattern = new RegExp(`^[א-ת]([א-ת \\-]*[א-ת])?[${escapeRegExpHelper(reEnd)}]*$`);
  } else {
    // נבדק: לינארי — קבוצה אופציונלית בודדת (?), עוגן '$' חוסם נסיגה
    // eslint-disable-next-line security/detect-unsafe-regex
    pattern = new RegExp("^[א-ת]([א-ת \\-]*[א-ת])?$");
  }

  const unmatchedRegex: string[] = [];
  const unmatchedTags: string[] = [];
  const missingLevels: number[] = [];
  const headersByLevel: Record<number, Array<{ level: number; content: string; full: string }>> = {};
  const orderedHeaders: Array<{ level: number; content: string; full: string }> = [];

  for (let i = 2; i <= 6; i += 1) {
    headersByLevel[i] = [];
    const tags = $(`h${i}`).toArray();
    if (!tags.length) {
      missingLevels.push(i);
    }

    for (const tag of tags) {
      const text = $(tag).text().trim();
      const full = $.html(tag);
      const entry = { level: i, content: text, full };

      headersByLevel[i].push(entry);
      orderedHeaders.push(entry);
    }
  }

  const step = isShas ? 2 : 1;
  const previousHeadersByLevel: Record<number, { level: number; content: string; full: string } | null> = {};

  for (const header of orderedHeaders) {
    const { level, content: headerText } = header;

    for (let deeperLevel = level + 1; deeperLevel <= 6; deeperLevel += 1) {
      previousHeadersByLevel[deeperLevel] = null;
    }

    if (!pattern.test(headerText)) {
      if (!(gershayim && (headerText.includes("'") || headerText.includes('"')))) {
        unmatchedRegex.push(header.full);
      }
    }

    const headerParts = headerText.split(" ");
    const currentHeading = headerParts.length > 1 ? headerParts[1] : headerText;

    if ((currentHeading.includes("'") || currentHeading.includes('"')) && !gershayim) {
      unmatchedTags.push(currentHeading);
    }

    const previousHeader = previousHeadersByLevel[level];
    if (previousHeader) {
      const previousText = previousHeader.content;
      const previousParts = previousText.split(" ");
      const previousHeading = previousParts.length > 1 ? previousParts[1] : previousText;
      const previousNum = toNumber(previousHeading);
      const currentNum = toNumber(currentHeading);

      if (previousNum > 0 && currentNum > 0 && previousNum + step !== currentNum) {
        unmatchedTags.push(`כותרת נוכחית - ${previousText} || כותרת הבאה - ${headerText}`);
      }
    }

    previousHeadersByLevel[level] = header;
  }

  return {
    unmatched_regex: unmatchedRegex,
    unmatched_tags: unmatchedTags,
    opening_without_closing: openingWithoutClosing,
    closing_without_opening: closingWithoutOpening,
    heading_errors: headingErrors,
    missing_levels: missingLevels,
  };
}
