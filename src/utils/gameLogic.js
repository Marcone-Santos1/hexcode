/**
 * Seeded pseudo-random number generator using the Mulberry32 algorithm.
 * @param {number} a - The seed.
 * @returns {function} A function that generates pseudo-random numbers between 0 and 1.
 */
function mulberry32(a) {
  return function() {
    let t = a += 0x6D2B79F5;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Generates a consistent 32-bit integer seed from a string (such as a date YYYY-MM-DD).
 * @param {string} str - The date or seed string.
 * @returns {number} The 32-bit seed.
 */
function getSeedFromString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash);
}

/**
 * Generates a Hexadecimal color (6 characters, e.g., '4A90E2') based on a date string.
 * @param {string} dateStr - Date string in YYYY-MM-DD format.
 * @returns {string} The daily color in hex format (uppercase, no '#').
 */
export function generateDailyColor(dateStr) {
  const seed = getSeedFromString(dateStr);
  const random = mulberry32(seed);
  
  // Generate random R, G, B channels (0-255)
  const r = Math.floor(random() * 256);
  const g = Math.floor(random() * 256);
  const b = Math.floor(random() * 256);
  
  // Helper to convert to 2-character hex
  const toHex = (val) => val.toString(16).padStart(2, '0').toUpperCase();
  
  return `${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/**
 * Converts a 6-digit hex string to RGB decimal values.
 * @param {string} hex - The hex string (e.g. '800080' or '#800080').
 * @returns {{r: number, g: number, b: number}} Object containing decimal r, g, b values.
 */
export function hexToRgb(hex) {
  const cleanHex = hex.replace('#', '').trim().toUpperCase();
  if (cleanHex.length !== 6) {
    return { r: 0, g: 0, b: 0 };
  }
  
  const r = parseInt(cleanHex.substring(0, 2), 16);
  const g = parseInt(cleanHex.substring(2, 4), 16);
  const b = parseInt(cleanHex.substring(4, 6), 16);
  
  return { r, g, b };
}

/**
 * Compares the guessed color channels with the target color channels.
 * Returns an array of comparison symbols: '⬆️' (guess is lower), '⬇️' (guess is higher), '✅' (exact).
 * @param {string} guessHex - The guessed hex color.
 * @param {string} targetHex - The target daily hex color.
 * @returns {string[]} An array containing [statusR, statusG, statusB].
 */
export function compareChannels(guessHex, targetHex) {
  const guess = hexToRgb(guessHex);
  const target = hexToRgb(targetHex);
  
  const getStatus = (gVal, tVal) => {
    if (gVal < tVal) return '⬆️';
    if (gVal > tVal) return '⬇️';
    return '✅';
  };
  
  return [
    getStatus(guess.r, target.r),
    getStatus(guess.g, target.g),
    getStatus(guess.b, target.b)
  ];
}
