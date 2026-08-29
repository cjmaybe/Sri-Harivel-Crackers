/**
 * Strips ALL HTML from a text field and trims it. Used for every free-text
 * value we store (names, addresses, category names, settings values, etc.)
 * The front end already HTML-escapes on output, but stripping tags on input
 * too means stored data is safe even if it's ever rendered somewhere that
 * forgets to escape, exported to CSV/PDF, emailed, etc.
 *
 * Implementation note: this app never needs to store literal HTML, so we
 * take the simplest, most bulletproof approach — repeatedly strip anything
 * that looks like a tag, then strip any leftover angle brackets outright
 * (which also defeats malformed/incomplete-tag tricks like "<script" with
 * no closing bracket). No HTML-parsing dependency required.
 */
function cleanText(value, maxLength = 500) {
  if (value == null) return "";
  let str = String(value);
  let prev;
  do {
    prev = str;
    str = str.replace(/<[^>]*>/g, "");
  } while (str !== prev);
  str = str.replace(/[<>]/g, "");
  // eslint-disable-next-line no-control-regex
  str = str.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, ""); // strip control chars
  return str.trim().slice(0, maxLength);
}

/**
 * Validates a value is a safe http(s) URL (or a same-site relative path like
 * /uploads/xyz.jpg). Rejects javascript:, data:, vbscript: and other schemes
 * that could be used for XSS if ever placed into an href/src by mistake.
 * Returns the trimmed URL, or "" if invalid/empty.
 */
function cleanUrl(value, maxLength = 500) {
  if (value == null) return "";
  const str = String(value).trim().slice(0, maxLength);
  if (!str) return "";
  if (str.startsWith("/")) return str; // relative path, e.g. /uploads/xyz.jpg
  try {
    const parsed = new URL(str);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") return str;
  } catch {
    // fall through
  }
  return "";
}

/**
 * Validates a phone / WhatsApp number: digits, spaces, +, - only, 7-15 digits.
 */
function isValidPhone(value) {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  if (!/^[0-9+\-\s()]{7,20}$/.test(trimmed)) return false;
  const digitCount = (trimmed.match(/\d/g) || []).length;
  return digitCount >= 7 && digitCount <= 15;
}

module.exports = { cleanText, cleanUrl, isValidPhone };
