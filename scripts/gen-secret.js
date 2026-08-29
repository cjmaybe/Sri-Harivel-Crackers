#!/usr/bin/env node
// Prints a cryptographically random 96-character hex string, suitable for
// use as SESSION_SECRET in .env.
console.log(require("crypto").randomBytes(48).toString("hex"));
