/** Small shared formatter for semantic numbering labels. */
export function formatNumber(value, format = 'decimal') {
  const n = Math.max(0, Math.trunc(Number(value) || 0));
  switch (format) {
    case 'bullet': return '';
    case 'lowerLetter': return toLetters(n).toLowerCase();
    case 'upperLetter': return toLetters(n);
    case 'lowerRoman': return toRoman(n).toLowerCase();
    case 'upperRoman': return toRoman(n);
    case 'decimalZero': return String(n).padStart(2, '0');
    case 'none': return '';
    case 'decimal':
    default: return String(n);
  }
}

function toLetters(value) {
  let n = Math.max(1, value);
  let out = '';
  while (n > 0) {
    n -= 1;
    out = String.fromCharCode(65 + (n % 26)) + out;
    n = Math.floor(n / 26);
  }
  return out;
}

function toRoman(value) {
  if (value <= 0) return String(value);
  const pairs = [
    [1000,'M'],[900,'CM'],[500,'D'],[400,'CD'],[100,'C'],[90,'XC'],
    [50,'L'],[40,'XL'],[10,'X'],[9,'IX'],[5,'V'],[4,'IV'],[1,'I']
  ];
  let n = value;
  let out = '';
  for (const [amount, glyph] of pairs) {
    while (n >= amount) { out += glyph; n -= amount; }
  }
  return out;
}
