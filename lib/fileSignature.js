const fs = require("fs");

// Known magic-byte signatures for the image types we accept.
// We deliberately do NOT allow SVG (it can carry <script>/onload XSS) or
// any non-image format, no matter what extension/mimetype the client sent.
const SIGNATURES = [
  { type: "image/jpeg", ext: [".jpg", ".jpeg"], bytes: [0xff, 0xd8, 0xff] },
  { type: "image/png", ext: [".png"], bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { type: "image/gif", ext: [".gif"], bytes: [0x47, 0x49, 0x46, 0x38] },
  // WEBP: "RIFF"....."WEBP" — check both fixed segments.
  { type: "image/webp", ext: [".webp"], bytes: [0x52, 0x49, 0x46, 0x46], offset: 0, webp: true }
];

function matchesSignature(buffer, sig) {
  const start = sig.offset || 0;
  for (let i = 0; i < sig.bytes.length; i++) {
    if (buffer[start + i] !== sig.bytes[i]) return false;
  }
  if (sig.webp) {
    // bytes 8-11 must be "WEBP"
    const webpTag = buffer.slice(8, 12).toString("ascii");
    if (webpTag !== "WEBP") return false;
  }
  return true;
}

/**
 * Reads the first 16 bytes of a file on disk and checks them against known
 * image magic numbers. Returns the matched mime type, or null if the file
 * doesn't look like any of our allowed image formats — regardless of what
 * extension or Content-Type header the upload claimed to be.
 */
function detectImageType(filePath) {
  const fd = fs.openSync(filePath, "r");
  try {
    const buffer = Buffer.alloc(16);
    fs.readSync(fd, buffer, 0, 16, 0);
    for (const sig of SIGNATURES) {
      if (matchesSignature(buffer, sig)) return sig.type;
    }
    return null;
  } finally {
    fs.closeSync(fd);
  }
}

const ALLOWED_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".gif", ".webp"]);
const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);

module.exports = { detectImageType, ALLOWED_EXTENSIONS, ALLOWED_MIME_TYPES };
