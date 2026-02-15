import admin from "firebase-admin";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

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
    try {
      return JSON.parse(normalizedValue.replace(/\\n/g, "\n"));
    } catch {
      try {
        const decoded = Buffer.from(normalizedValue, "base64").toString("utf8");
        return JSON.parse(decoded);
      } catch {
        throw new Error(`Invalid Firebase service account JSON from ${source}.`);
      }
    }
  }
};

const resolveServiceAccountFromEnv = () => {
  const explicitKeys = [
    "FIREBASE_SERVICE_ACCOUNT_JSON",
    "FIREBASE_SERVICE_ACCOUNT__JSON",
  ];

  for (const key of explicitKeys) {
    if (process.env[key]) {
      return parseServiceAccountJson(process.env[key], key);
    }
  }

  const dynamicKey = Object.keys(process.env).find(
    (key) =>
      key.startsWith("FIREBASE_SERVICE_ACCOUNT") &&
      key.endsWith("JSON") &&
      process.env[key]
  );

  if (dynamicKey) {
    return parseServiceAccountJson(process.env[dynamicKey], dynamicKey);
  }

  return null;
};

const resolveServiceAccount = () => {
  const serviceAccountFromEnv = resolveServiceAccountFromEnv();
  if (serviceAccountFromEnv) {
    return serviceAccountFromEnv;
  }

  const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;

  if (serviceAccountPath) {
    if (!fs.existsSync(serviceAccountPath)) {
      throw new Error(
        `FIREBASE_SERVICE_ACCOUNT_PATH does not exist: ${serviceAccountPath}`
      );
    }

    return parseServiceAccountJson(
      fs.readFileSync(serviceAccountPath, "utf8"),
      `file ${serviceAccountPath}`
    );
  }

  if (fs.existsSync(defaultServiceAccountPath)) {
    return parseServiceAccountJson(
      fs.readFileSync(defaultServiceAccountPath, "utf8"),
      `file ${defaultServiceAccountPath}`
    );
  }

  throw new Error(
    "Firebase service account is missing. Set FIREBASE_SERVICE_ACCOUNT_JSON (or FIREBASE_SERVICE_ACCOUNT__JSON) on Render, or set FIREBASE_SERVICE_ACCOUNT_PATH."
  );
};

const serviceAccount = resolveServiceAccount();

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

export default admin;