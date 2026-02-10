export const registerSchema = {
  body: {
    display_name: { type: "string", required: true, minLength: 2 },
    email: { type: "string", required: true, format: "email" },
    password: { type: "string", required: true, minLength: 6 },
  },
};

export const verifyEmailSchema = {
  body: {
    email: { type: "string", required: true, format: "email" },
    verification_code: {
      type: "string",
      required: true,
      minLength: 6,
      maxLength: 6,
    },
  },
};

export const resendVerificationSchema = {
  body: {
    email: { type: "string", required: true, format: "email" },
  },
};

export const loginSchema = {
  body: {
    email: { type: "string", required: true, format: "email" },
    password: { type: "string", required: true },
  },
};

export const refreshSchema = {
  body: {
    refreshToken: { type: "string", required: true },
  },
};

export const firebaseLoginSchema = {
  body: {
    idToken: { type: "string", required: true },
  },
};

export const forgotPasswordSchema = {
  body: {
    email: { type: "string", required: true, format: "email" },
  },
};

export const resetPasswordSchema = {
  body: {
    email: { type: "string", required: true, format: "email" },
    verification_code: {
      type: "string",
      required: true,
      minLength: 6,
      maxLength: 6,
    },
    new_password: { type: "string", required: true, minLength: 6 },
  },
};

export default {
  registerSchema,
  verifyEmailSchema,
  resendVerificationSchema,
  loginSchema,
  refreshSchema,
  firebaseLoginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
};
