const formatError = (field, message) => ({ field, message });

const validators = {
  string: (value) => typeof value === "string",
  email: (value) =>
    typeof value === "string" &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.toLowerCase()),
  number: (value) => typeof value === "number" && !Number.isNaN(value),
  boolean: (value) => typeof value === "boolean",
};

const validateField = (key, value, rules) => {
  if (
    rules.required &&
    (value === undefined || value === null || value === "")
  ) {
    return formatError(key, "Field is required");
  }

  if (value === undefined || value === null) return null;

  if (rules.type && validators[rules.type] && !validators[rules.type](value)) {
    return formatError(key, `Field must be of type ${rules.type}`);
  }

  if (
    rules.minLength &&
    typeof value === "string" &&
    value.length < rules.minLength
  ) {
    return formatError(key, `Minimum length is ${rules.minLength}`);
  }

  if (
    rules.maxLength &&
    typeof value === "string" &&
    value.length > rules.maxLength
  ) {
    return formatError(key, `Maximum length is ${rules.maxLength}`);
  }

  if (
    rules.format &&
    validators[rules.format] &&
    !validators[rules.format](value)
  ) {
    return formatError(key, `Field must be a valid ${rules.format}`);
  }

  if (rules.enum && Array.isArray(rules.enum) && !rules.enum.includes(value)) {
    return formatError(key, `Field must be one of: ${rules.enum.join(", ")}`);
  }

  return null;
};

const validateSection = (data, sectionSchema) => {
  const errors = [];

  Object.entries(sectionSchema).forEach(([key, rules]) => {
    const error = validateField(key, data?.[key], rules);
    if (error) errors.push(error);
  });

  return errors;
};

const validate = (schema) => (req, res, next) => {
  const errors = [];

  if (schema.body) {
    errors.push(...validateSection(req.body, schema.body));
  }

  if (schema.params) {
    errors.push(...validateSection(req.params, schema.params));
  }

  if (schema.query) {
    errors.push(...validateSection(req.query, schema.query));
  }

  if (errors.length > 0) {
    return res.status(400).json({
      message: "Validation error",
      errors,
    });
  }

  return next();
};

export default validate;
