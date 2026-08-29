const logger = require("../lib/logger");
const multer = require("multer");

function isProd() {
  return process.env.NODE_ENV === "production";
}

// Catches errors thrown/rejected inside async route handlers and forwards
// them to the error-handling middleware instead of crashing the process.
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

function notFoundHandler(req, res) {
  res.status(404).json({ error: "Not found" });
}

// Must be registered LAST (4 args = Express error middleware signature).
function errorHandler(err, req, res, next) { // eslint-disable-line no-unused-vars
  const requestId = req.id;

  if (err instanceof multer.MulterError) {
    logger.warn("Upload rejected", { requestId, code: err.code, message: err.message });
    const message = err.code === "LIMIT_FILE_SIZE" ? "File too large (max 5MB)" : "Upload error";
    return res.status(400).json({ error: message });
  }

  if (err && err.type === "entity.too.large") {
    return res.status(413).json({ error: "Request body too large" });
  }

  if (err && err.type === "entity.parse.failed") {
    return res.status(400).json({ error: "Malformed JSON body" });
  }

  const status = err && err.status && Number.isInteger(err.status) ? err.status : 500;

  logger.error("Unhandled request error", {
    requestId,
    status,
    message: err && err.message,
    stack: !isProd() ? err && err.stack : undefined,
    path: req.originalUrl,
    method: req.method
  });

  // Never leak stack traces, file paths, or internal error details to the client.
  const clientMessage = status < 500 && err.message ? err.message : "Something went wrong. Please try again.";
  res.status(status).json({ error: clientMessage, requestId });
}

module.exports = { asyncHandler, notFoundHandler, errorHandler };
