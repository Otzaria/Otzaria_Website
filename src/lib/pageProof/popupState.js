// מכונת-המצבים של חלונית ההצעות למילה (hover) — טהורה, כדי שאפשר יהיה לבדוק
// את הבאג "החלונית לא נסגרת אחרי שהעכבר עוזב את המילה" בלי דפדפן.
//
// הכללים:
// • enterWord{key} — פותח על המילה (ההשהיה של 250ms לפני הפתיחה — ב-UI).
// • עזיבת המילה או החלונית — "סגירה ממתינה" (pendingClose); ה-UI מפעיל
//   טיימר של 180ms ששולח closeTimer.
// • כניסה למילה או לחלונית — מבטלת את הסגירה הממתינה (מעבר מהמילה לחלונית).
// • closeTimer — סוגר רק אם יש סגירה ממתינה ואין ריחוף לא על המילה ולא על
//   החלונית (טיימר ישן שנורה באיחור לא סוגר חלונית שהעכבר חזר אליה).
// • escape / scroll / blur (החלפת לשונית, חלון לא פעיל) / pick — סגירה מיידית.
// • caretMove{key} — סוגר כשהסמן עזב את המילה (key = המילה של הסמן החדש;
//   בלי key = הסמן כבר לא במילה).
// • openKeyboard{key} (תוספת) — פתיחה מהמקלדת (Alt+↓): בלי ריחוף, ולכן לא
//   נסגרת מעזיבת-עכבר (גם כשהעכבר עבר על המילה או על החלונית ויצא) אלא רק
//   מ-Escape/בחירה/הזזת-הסמן; ריחוף על אותה מילה אינו הופך אותה לחלונית-ריחוף.
//
// אירוע = {type, key?} או מחרוזת-הסוג בלבד.

export const POPUP_OPEN_DELAY_MS = 250;
export const POPUP_CLOSE_DELAY_MS = 180;

export const POPUP_CLOSED = Object.freeze({ open: false, wordKey: null, hoverWord: false, hoverPopup: false, pendingClose: false });
export const initialPopupState = POPUP_CLOSED;

const typeOf = (event) => (typeof event === 'string' ? event : event?.type ?? event?.kind ?? null);
const keyOf = (event) => (event && typeof event === 'object' ? event.key ?? event.wordKey ?? null : null);

export function popupReducer(state, event) {
  const s = state && typeof state === 'object' ? state : POPUP_CLOSED;
  const key = keyOf(event);
  switch (typeOf(event)) {
    case 'enterWord': {
      if (key == null) return s;
      if (event?.keyboard) return { open: true, wordKey: key, hoverWord: false, hoverPopup: false, pendingClose: false, keyboard: true };
      const sameWord = s.open && s.wordKey === key;
      // חלונית-מקלדת נשארת חלונית-מקלדת (↑↓ Enter) כשהעכבר עובר על מילתה
      if (sameWord && s.keyboard) return { ...s, hoverWord: true, pendingClose: false };
      return { open: true, wordKey: key, hoverWord: true, hoverPopup: sameWord ? !!s.hoverPopup : false, pendingClose: false };
    }
    case 'openKeyboard':
      if (key == null) return s;
      return { open: true, wordKey: key, hoverWord: false, hoverPopup: false, pendingClose: false, keyboard: true };
    case 'leaveWord':
      // עזיבה של מילה אחרת (לא זו שהחלונית שלה) אינה נוגעת לחלונית
      if (!s.open || (key != null && key !== s.wordKey)) return s;
      // חלונית-מקלדת אינה נסגרת מתנועת-עכבר
      if (s.keyboard) return s.hoverWord ? { ...s, hoverWord: false } : s;
      return { ...s, hoverWord: false, pendingClose: true };
    case 'enterPopup':
      return s.open ? { ...s, hoverPopup: true, pendingClose: false } : s;
    case 'leavePopup':
      if (!s.open) return s;
      if (s.keyboard) return s.hoverPopup ? { ...s, hoverPopup: false } : s;
      return { ...s, hoverPopup: false, pendingClose: true };
    case 'closeTimer':
      if (!s.open || !s.pendingClose) return s;
      return s.hoverWord || s.hoverPopup ? { ...s, pendingClose: false } : POPUP_CLOSED;
    case 'caretMove':
      if (!s.open || (key != null && key === s.wordKey)) return s;
      return POPUP_CLOSED;
    case 'escape':
    case 'scroll':
    case 'blur':
    case 'pick':
      return POPUP_CLOSED;
    default:
      return s;
  }
}
