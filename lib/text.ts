/**
 * Tiny, dependency-free text helpers for Hebrew + English.
 *
 * This is deliberately NOT semantic search. It normalises text, removes
 * filler words and reduces words to a rough stem (so "קהילות", "קהילה" and
 * "הקהילה" meet each other). Good enough for transparent keyword matching.
 */

const NIQQUD = /[֑-ׇ]/g;
const HEBREW_LETTER = /[א-ת]/;

const FINAL_LETTERS: Record<string, string> = { ם: "מ", ן: "נ", ץ: "צ", ף: "פ", ך: "כ" };

const STOPWORDS = new Set(
  (
    // Hebrew
    "את של על עם אל או גם כי אם לא אני אנחנו אנו הוא היא הם הן זה זו זאת אלה יש אין כל מה מי איך למה מתי איפה " +
    "רוצה רוצים רוצות רציתי אשמח היה היו להיות יהיה שיהיה כמו כדי אבל רק עוד מאוד אז כן לי לנו לו לה להם שלי שלנו " +
    "אצלנו אצלי בין לפני אחרי תוך דרך מול ליד ידי אחד אחת אפשר צריך צריכה צריכים ניתן יכול יכולה יכולים " +
    "הזה הזו הזאת האלה שם פה כאן עכשיו ואני ואנחנו שאני שאנחנו מחפש מחפשת מחפשים למצוא מצוא " +
    "מיזם מיזמים למיזם למיזמים המיזם המיזמים במיזם מיזמי יוזמה יוזמות יוזמת ליוזמה פרויקט פרויקטים לעזור לתרום " +
    "משהו יותר פחות אחרת אחר אחרים שבה שבו שבהם ניסיון עוסקים עוסק עוסקות בונות בונים " +
    // English
    "the a an of to and in for with on we our is are that it by as at or be from this who can i my me you your " +
    "want wants would like looking find need needs help have has had into more some any " +
    "initiative initiatives project projects something other others"
  ).split(/\s+/),
);

export function isHebrew(word: string): boolean {
  return HEBREW_LETTER.test(word);
}

/** lower-case, strip niqqud/quotes, unify punctuation to spaces. */
export function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(NIQQUD, "")
    .replace(/["'״׳`’]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/** Words without filler; keeps 2+ character tokens ("ai" survives). */
export function tokenize(text: string): string[] {
  return normalize(text)
    .split(/\s+/)
    .filter((w) => w.length >= 2 && !STOPWORDS.has(w));
}

const HE_SUFFIXES = ["יות", "ים", "ות", "ית", "ה", "י", "ת"];

function stemHebrew(input: string): string {
  let w = input.replace(/[םןץףך]/g, (c) => FINAL_LETTERS[c] ?? c);
  if (w.length >= 5 && /^ו[הבכלמש]/.test(w)) w = w.slice(2);
  else if (w.length >= 4 && /^[והבכלמש]/.test(w)) w = w.slice(1);
  for (let pass = 0; pass < 2; pass++) {
    const suffix = HE_SUFFIXES.find((s) => w.endsWith(s) && w.length - s.length >= 3);
    if (!suffix) break;
    w = w.slice(0, -suffix.length);
  }
  return w;
}

function stemLatin(w: string): string {
  if (w.length <= 3) return w;
  if (w.endsWith("ies") && w.length > 4) return w.slice(0, -3) + "y";
  if (w.endsWith("ing") && w.length > 5) return w.slice(0, -3);
  if (w.endsWith("ed") && w.length > 4) return w.slice(0, -2);
  if (w.endsWith("es") && w.length > 4) return w.slice(0, -2);
  if (w.endsWith("s") && !w.endsWith("ss")) return w.slice(0, -1);
  return w;
}

export function stem(word: string): string {
  return isHebrew(word) ? stemHebrew(word) : stemLatin(word);
}

/** Unique stems of the meaningful words in `text`. */
export function stems(text: string): string[] {
  return [...new Set(tokenize(text).map(stem))];
}

/** Map stem → the first original word that produced it (for readable explanations). */
export function stemsWithWords(text: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const word of tokenize(text)) {
    const s = stem(word);
    if (!map.has(s)) map.set(s, word);
  }
  return map;
}
