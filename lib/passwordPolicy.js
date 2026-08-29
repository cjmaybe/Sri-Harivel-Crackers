const crypto = require("crypto");

const MIN_LENGTH = 10;

// A short list of the most commonly breached / trivially guessable passwords.
// Not exhaustive — defense in depth alongside the complexity rules below.
const COMMON_PASSWORDS = new Set([
  "changeme123", "password", "password1", "admin123", "admin1234",
  "12345678", "123456789", "1234567890", "qwerty123", "letmein123",
  "welcome123", "iloveyou1", "administrator"
]);

/**
 * Validates password strength. Returns { valid: boolean, errors: string[] }.
 */
function validatePasswordStrength(password) {
  const errors = [];
  if (typeof password !== "string" || password.length === 0) {
    return { valid: false, errors: ["Password is required"] };
  }
  if (password.length < MIN_LENGTH) {
    errors.push(`Password must be at least ${MIN_LENGTH} characters long`);
  }
  if (password.length > 200) {
    errors.push("Password must be under 200 characters long");
  }
  if (!/[a-z]/.test(password)) errors.push("Password must include a lowercase letter");
  if (!/[A-Z]/.test(password)) errors.push("Password must include an uppercase letter");
  if (!/[0-9]/.test(password)) errors.push("Password must include a number");
  if (!/[^A-Za-z0-9]/.test(password)) errors.push("Password must include a special character");
  if (COMMON_PASSWORDS.has(password.toLowerCase())) {
    errors.push("Password is too common; choose something less predictable");
  }
  return { valid: errors.length === 0, errors };
}

/**
 * Generates a cryptographically random password that always satisfies the
 * policy above. Used for first-run admin creation when no ADMIN_PASSWORD
 * is supplied in the environment.
 */
function generateStrongPassword(length = 20) {
  const lower = "abcdefghijkmnpqrstuvwxyz";
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const digits = "23456789";
  const symbols = "!@#$%^&*-_=+?";
  const all = lower + upper + digits + symbols;

  function pick(charset) {
    return charset[crypto.randomInt(0, charset.length)];
  }

  const required = [pick(lower), pick(upper), pick(digits), pick(symbols)];
  const rest = Array.from({ length: Math.max(length - required.length, 0) }, () => pick(all));
  const chars = required.concat(rest);

  // Fisher-Yates shuffle using a CSPRNG so required chars aren't predictably placed.
  for (let i = chars.length - 1; i > 0; i--) {
    const j = crypto.randomInt(0, i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}

module.exports = { validatePasswordStrength, generateStrongPassword, MIN_LENGTH };
