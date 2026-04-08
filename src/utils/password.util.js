export const PASSWORD_MIN_LENGTH = 6;
export const PASSWORD_ALLOWED_PATTERN = /^[\x21-\x7E]+$/;
export const PASSWORD_ALLOWED_MESSAGE =
  "Mat khau chi duoc chua chu cai, chu so va ky tu dac biet thong dung nhu @, *; khong duoc chua khoang trang hoac emoji/icon";

export const validatePassword = (
  password,
  { fieldName = "Mat khau" } = {}
) => {
  if (typeof password !== "string" || password.length === 0) {
    return `${fieldName} la bat buoc`;
  }

  if (password.length < PASSWORD_MIN_LENGTH) {
    return `${fieldName} phai co it nhat ${PASSWORD_MIN_LENGTH} ky tu`;
  }

  if (!PASSWORD_ALLOWED_PATTERN.test(password)) {
    return PASSWORD_ALLOWED_MESSAGE;
  }

  return null;
};
