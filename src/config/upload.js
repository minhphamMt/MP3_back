import path from "path";

const storageConfig = {
  driver: process.env.STORAGE_DRIVER || "local",
  cdnBaseUrl: process.env.STORAGE_CDN_BASE_URL || "",
  local: {
    uploadDir: process.env.LOCAL_UPLOAD_DIR || path.resolve("uploads"),
    baseUrl: process.env.LOCAL_UPLOAD_BASE_URL || "/uploads",
  },
  s3: {
    bucket: process.env.S3_BUCKET,
    region: process.env.S3_REGION,
    accessKeyId: process.env.S3_ACCESS_KEY_ID,
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
    expiresIn: parseInt(process.env.S3_SIGNED_URL_EXPIRES || "900", 10),
  },
  gcs: {
    bucket: process.env.GCS_BUCKET,
    projectId: process.env.GCS_PROJECT_ID,
    keyFilename: process.env.GCS_KEY_FILE,
    expiresIn: parseInt(process.env.GCS_SIGNED_URL_EXPIRES || "900", 10),
  },
};

export default storageConfig;
