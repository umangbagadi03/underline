// Key words: the meaningful words of a sentence, used to compare answer and source.

const STOPWORDS = new Set(`
a an the and or but if then than so as at by for from in into of on onto to up with without
is are was were be been being am do does did done has have had having will would shall should
can could may might must it its this that these those there here which who whom whose what when
where why how all any each every both few more most other some such only own same too very
also just not no nor yes per via you your yours we our us they their them he she his her i me my
under over about after before during above below between through again further once
document according states stated mentioned says answer
`.split(/\s+/).filter(Boolean));

// Words that mean "no", "not covered", etc.
const NEGATIVE_WORDS = new Set([
  'not', 'no', 'never', 'none', 'nor', 'neither', 'cannot', 'excluded', 'exclusion', 'exclusions',
  'exclude', 'excludes', 'without', 'except', 'unless', 'prohibited', 'ineligible', 'void',
  "isn't", "aren't", "won't", "doesn't", "don't", "can't", 'nil', 'lapse', 'forfeited',
]);

/** Cut common endings so "covered" and "covers" look alike. */
export function stem(word) {
  const endings = ['ations', 'ation', 'ings', 'ing', 'ies', 'ied', 'es', 'ed', 'ly', 's'];
  for (const end of endings) {
    if (word.endsWith(end) && word.length - end.length >= 4) {
      return word.slice(0, -end.length);
    }
  }
  return word;
}

/** Lowercase words of the text (letters only). "co-payment" becomes "copayment". */
export function wordsOf(text) {
  const lower = text.toLowerCase();
  const joined = lower.replace(/([a-z])-([a-z])/g, '$1$2');
  const lettersOnly = joined.replace(/[^a-z']+/g, ' ');
  return lettersOnly.split(' ').filter(Boolean);
}

/** Use one spelling: "hospitalization" -> "hospitalisation", "authorized" -> "authorised". */
function britishSpelling(word) {
  return word.replace(/iz(e|ed|es|ing|ation|ations)$/, 'is$1');
}

/** Stemmed key words of the text (no stopwords, at least 3 letters). */
export function keywords(text) {
  const words = wordsOf(text).map((w) => britishSpelling(w.replace(/'/g, '')));
  const useful = words.filter((w) => w.length >= 3 && !STOPWORDS.has(w));
  return [...new Set(useful.map(stem))];
}

/** Does the source contain this key word? Long words may match by shared start ("hospital" ~ "hospitalisation"). */
export function keywordFound(word, sourceWords) {
  if (sourceWords.includes(word)) return true;
  if (word.length < 5) return false;
  return sourceWords.some((s) => s.length >= 5 && (s.startsWith(word) || word.startsWith(s)));
}

/** Does the text contain a "no / not / excluded" type word? */
export function hasNegativeWord(text) {
  const words = wordsOf(text);
  return words.some((w) => NEGATIVE_WORDS.has(w));
}

/** Does the text contain a plain "not / no / never" (the answer side)? */
export function saysNot(text) {
  const words = wordsOf(text);
  return words.some((w) => ['not', 'no', 'never', 'cannot', "isn't", "aren't", "won't", "doesn't", "don't", "can't"].includes(w));
}
