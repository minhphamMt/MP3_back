import {
  PASSWORD_ALLOWED_MESSAGE,
  PASSWORD_ALLOWED_PATTERN,
  PASSWORD_MIN_LENGTH,
} from "../utils/password.util.js";

export const changePasswordSchema = {
  body: {
    oldPassword: { type: "string", required: true },
    newPassword: {
      type: "string",
      required: true,
      minLength: PASSWORD_MIN_LENGTH,
      pattern: PASSWORD_ALLOWED_PATTERN,
      patternMessage: PASSWORD_ALLOWED_MESSAGE,
    },
  },
};

export default {
  changePasswordSchema,
};
