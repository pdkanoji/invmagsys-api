// numberToWords.js
// Converts a numeric amount into Indian-currency words, e.g.
//   23270      -> "Rs. Twenty Three Thousand Two Hundred and Seventy only"
//   1050575.50 -> "Rs. Ten Lakh Fifty Thousand Five Hundred and Seventy Five and Fifty Paise only"

const ONES = [
  '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
  'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
  'Seventeen', 'Eighteen', 'Nineteen',
];

const TENS = [
  '', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety',
];

// Converts a number 0-999 into words
const threeDigitsToWords = (num) => {
  let str = '';
  if (num >= 100) {
    str += `${ONES[Math.floor(num / 100)]} Hundred`;
    num %= 100;
    if (num > 0) str += ' and ';
  }
  if (num >= 20) {
    str += TENS[Math.floor(num / 10)];
    if (num % 10 > 0) str += ` ${ONES[num % 10]}`;
  } else if (num > 0) {
    str += ONES[num];
  }
  return str.trim();
};

// Converts the integer part using the Indian numbering system
// (crore = 10,000,000 / lakh = 100,000 / thousand = 1,000)
const integerToIndianWords = (num) => {
  if (num === 0) return 'Zero';

  const crore = Math.floor(num / 10000000);
  num %= 10000000;
  const lakh = Math.floor(num / 100000);
  num %= 100000;
  const thousand = Math.floor(num / 1000);
  num %= 1000;
  const hundred = num;

  const parts = [];
  if (crore) parts.push(`${threeDigitsToWords(crore)} Crore`);
  if (lakh) parts.push(`${threeDigitsToWords(lakh)} Lakh`);
  if (thousand) parts.push(`${threeDigitsToWords(thousand)} Thousand`);
  if (hundred) parts.push(threeDigitsToWords(hundred));

  return parts.join(' ').trim();
};

/**
 * @param {number} amount   The amount to convert (e.g. 23270 or 23270.50)
 * @param {object} [opts]
 * @param {string} [opts.currency='Rs.']   Currency prefix
 * @param {boolean} [opts.suffix=true]     Append " only" at the end
 * @returns {string}
 */
const numberToWords = (amount, opts = {}) => {
  const { currency = 'Rs.', suffix = true } = opts;

  const numeric = Number(amount) || 0;
  const isNegative = numeric < 0;
  const absolute = Math.abs(numeric);

  const rupees = Math.floor(absolute);
  // round paise to avoid floating point artifacts like 0.1 + 0.2
  const paise = Math.round((absolute - rupees) * 100);

  let words = `${currency} ${integerToIndianWords(rupees)}`;

  if (paise > 0) {
    words += ` and ${threeDigitsToWords(paise)} Paise`;
  }

  if (suffix) words += ' only';
  if (isNegative) words = `Minus ${words}`;

  return words;
};

module.exports = numberToWords;