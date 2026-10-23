// Find numbers in text, so "thirty days", "30 days" and "Rs. 30" all give 30.

const UNITS = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
  ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16,
  seventeen: 17, eighteen: 18, nineteen: 19,
};
const TENS = {
  twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90,
};
const MULTIPLIERS = { lakh: 100000, lakhs: 100000, lac: 100000, lacs: 100000, crore: 10000000, crores: 10000000, thousand: 1000 };

/** Replace number words with digits: "forty five" -> "45", "twenty-four" -> "24". */
export function wordsToDigits(text) {
  const tensWords = Object.keys(TENS).join('|');
  const unitWords = Object.keys(UNITS).join('|');
  const compound = new RegExp(`\\b(${tensWords})[\\s-]+(${unitWords})\\b`, 'gi');
  let result = text.replace(compound, (_, tens, unit) => {
    const value = TENS[tens.toLowerCase()] + UNITS[unit.toLowerCase()];
    return String(value);
  });
  const single = new RegExp(`\\b(${tensWords}|${unitWords})\\b`, 'gi');
  result = result.replace(single, (word) => {
    const lower = word.toLowerCase();
    return String(TENS[lower] ?? UNITS[lower]);
  });
  return result;
}

/**
 * Get all numbers in the text as plain values.
 * "Rs. 5,00,000" -> 500000, "5 lakh" -> 500000, "2%" -> 2, "1st" -> 1.
 */
export function extractNumbers(text) {
  const withDigits = wordsToDigits(text);
  const pattern = /\d[\d,]*(\.\d+)?(\s*(lakhs?|lacs?|crores?|thousand)\b)?/gi;
  const numbers = [];
  for (const match of withDigits.matchAll(pattern)) {
    const digits = match[0].match(/\d[\d,]*(\.\d+)?/)[0];
    let value = parseFloat(digits.replace(/,/g, ''));
    const unit = match[3] ? match[3].toLowerCase() : null;
    if (unit) value = value * MULTIPLIERS[unit];
    numbers.push(value);
  }
  return numbers;
}

/** Numbers followed by a time unit, e.g. "3 years" -> [{ value: 3, unit: 'year' }]. */
function timeNumbers(text) {
  const withDigits = wordsToDigits(text);
  const pattern = /(\d+)\s*(years?|months?)\b/gi;
  const found = [];
  for (const match of withDigits.matchAll(pattern)) {
    const unit = match[2].toLowerCase().startsWith('year') ? 'year' : 'month';
    found.push({ value: Number(match[1]), unit });
  }
  return found;
}

/**
 * Is `value` (from the answer) present in the source numbers?
 * Also accepts "2 years" when the source says "24 months", and the other way round.
 */
export function numberFound(value, claimText, sourceNumbers) {
  if (sourceNumbers.includes(value)) return true;
  const times = timeNumbers(claimText).filter((t) => t.value === value);
  for (const t of times) {
    if (t.unit === 'year' && sourceNumbers.includes(value * 12)) return true;
    if (t.unit === 'month' && value % 12 === 0 && sourceNumbers.includes(value / 12)) return true;
  }
  return false;
}
