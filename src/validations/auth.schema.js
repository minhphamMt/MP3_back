export const registerSchema = {
  body: {
    display_name: { type: "string", required: true, minLength: 2 },
    email: { type: "string", required: true, format: "email" },
    password: { type: "string", required: true, minLength: 6 },
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

export default {
  registerSchema,
  loginSchema,
  refreshSchema,
};
