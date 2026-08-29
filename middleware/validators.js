const { body, param, validationResult } = require("express-validator");

function handleValidation(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ error: errors.array({ onlyFirstError: true })[0].msg, fields: errors.array() });
  }
  next();
}

const ALLOWED_SETTINGS_KEYS = new Set([
  "site_name", "tagline", "whatsapp_number", "whatsapp_number_2",
  "phone_1", "phone_2", "email", "address", "min_order_tn", "min_order_other",
  "pricelist_url", "instagram_url", "youtube_url", "facebook_url"
]);

const loginValidators = [
  body("username").isString().trim().isLength({ min: 1, max: 100 }).withMessage("Username is required"),
  body("password").isString().isLength({ min: 1, max: 200 }).withMessage("Password is required"),
  handleValidation
];

const changePasswordValidators = [
  body("currentPassword").isString().isLength({ min: 1, max: 200 }).withMessage("Current password is required"),
  body("newPassword").isString().isLength({ min: 1, max: 200 }).withMessage("New password is required"),
  handleValidation
];

const productValidators = [
  body("name").isString().trim().isLength({ min: 1, max: 200 }).withMessage("Product name is required (max 200 chars)"),
  body("category").isString().trim().isLength({ min: 1, max: 100 }).withMessage("Category is required (max 100 chars)"),
  body("pack").optional({ nullable: true }).isString().isLength({ max: 100 }).withMessage("Pack must be under 100 chars"),
  body("img").optional({ nullable: true }).isString().isLength({ max: 500 }).withMessage("Image URL must be under 500 chars"),
  body("price").isFloat({ min: 0, max: 10000000 }).withMessage("Price must be a number between 0 and 10,000,000"),
  body("orig").isFloat({ min: 0, max: 10000000 }).withMessage("Original price must be a number between 0 and 10,000,000"),
  body("active").optional().isBoolean().withMessage("active must be true/false"),
  handleValidation
];

const productIdValidators = [
  param("id").isInt({ min: 1 }).withMessage("Invalid product id"),
  handleValidation
];

const categoryValidators = [
  body("name").isString().trim().isLength({ min: 1, max: 100 }).withMessage("Category name is required (max 100 chars)"),
  handleValidation
];

const categoryIdValidators = [
  param("id").isInt({ min: 1 }).withMessage("Invalid category id"),
  handleValidation
];

const orderValidators = [
  body("custName").optional({ nullable: true }).isString().isLength({ max: 100 }).withMessage("Name must be under 100 chars"),
  body("custMobile").optional({ nullable: true }).isString().isLength({ max: 30 }).withMessage("Mobile number is invalid"),
  body("custAddress").optional({ nullable: true }).isString().isLength({ max: 500 }).withMessage("Address must be under 500 chars"),
  body("items").isArray({ min: 1, max: 100 }).withMessage("Cart must contain 1-100 items"),
  body("items.*.id").isInt({ min: 1 }).withMessage("Invalid item id"),
  body("items.*.qty").isInt({ min: 1, max: 999 }).withMessage("Quantity must be between 1 and 999"),
  handleValidation
];

const orderIdValidators = [
  param("id").isInt({ min: 1 }).withMessage("Invalid order id"),
  handleValidation
];

const orderStatusValidators = [
  param("id").isInt({ min: 1 }).withMessage("Invalid order id"),
  body("status").isIn(["new", "confirmed", "delivered", "cancelled"]).withMessage("Invalid status"),
  handleValidation
];

const settingsValidators = [
  body().custom((value) => {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      throw new Error("Invalid settings payload");
    }
    for (const key of Object.keys(value)) {
      if (!ALLOWED_SETTINGS_KEYS.has(key)) {
        throw new Error(`Unknown setting key: ${key}`);
      }
      if (typeof value[key] !== "string" && typeof value[key] !== "number") {
        throw new Error(`Setting ${key} must be text`);
      }
      if (String(value[key]).length > 500) {
        throw new Error(`Setting ${key} is too long`);
      }
    }
    return true;
  }),
  handleValidation
];

module.exports = {
  handleValidation,
  loginValidators,
  changePasswordValidators,
  productValidators,
  productIdValidators,
  categoryValidators,
  categoryIdValidators,
  orderValidators,
  orderIdValidators,
  orderStatusValidators,
  settingsValidators,
  ALLOWED_SETTINGS_KEYS
};
