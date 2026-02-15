import admin from "firebase-admin";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// fix __dirname cho ES module
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const defaultServiceAccountPath = path.resolve(
  __dirname,
  "../../firebase-service-account.json"
);

const parseServiceAccountJson = (rawValue, source) => {
  if (!rawValue || typeof rawValue !== "string") {
    return null;
  }

  const normalizedValue = rawValue.trim();

  try {
    return JSON.parse(normalizedValue);
  } catch {
    // Render/env dashboards đôi khi lưu chuỗi JSON với xuống dòng bị escape (\n)
    try {
      return JSON.parse(normalizedValue.replace(/\\n/g, "\n"));
    } catch {
      // Cho phép truyền base64 để tránh lỗi escape ký tự đặc biệt
      try {
        const decoded = Buffer.from(normalizedValue, "base64").toString("utf8");
        return JSON.parse(decoded);
      } catch {
        throw new Error(
          `Invalid Firebase service account JSON from ${source}.`
        );
      }
    }
  }
};

const resolveServiceAccount = () => {
  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    return parseServiceAccountJson(
      process.env.FIREBASE_SERVICE_ACCOUNT_JSON,
      "FIREBASE_SERVICE_ACCOUNT_JSON"
    );
  }

  const serviceAccountPath =
    process.env.FIREBASE_SERVICE_ACCOUNT_PATH || defaultServiceAccountPath;

  if (!fs.existsSync(serviceAccountPath)) {
    throw new Error(
      "Firebase service account not found. Set FIREBASE_SERVICE_ACCOUNT_JSON or FIREBASE_SERVICE_ACCOUNT_PATH."
    );
  }

  return parseServiceAccountJson(
    fs.readFileSync(serviceAccountPath, "utf8"),
    `file ${serviceAccountPath}`
  );
};

const serviceAccount = resolveServiceAccount();

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

export default admin;
