import crypto from "crypto";

export const generateZingId = (prefix) => {
  const normalizedPrefix = prefix ?? "zing";
  const token = crypto.randomUUID().replace(/-/g, "").slice(0, 12);
  return `${normalizedPrefix}${token}`;
};

export default generateZingId;