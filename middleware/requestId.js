const crypto = require("crypto");

module.exports = function requestId(req, res, next) {
  req.id = crypto.randomBytes(8).toString("hex");
  res.setHeader("X-Request-Id", req.id);
  next();
};
