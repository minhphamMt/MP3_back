import path from "path";

const isAbsolutePath = (inputPath) =>
  path.isAbsolute(inputPath) || path.win32.isAbsolute(inputPath);

const resolvePath = (inputPath) =>
  isAbsolutePath(inputPath) ? inputPath : path.resolve(inputPath);

const defaultLocalRoot =
  process.platform === "win32"
    ? "D:\\\\music_dump"
    : path.resolve("/mnt/d/music_dump");

const storageConfig = {
  driver: process.env.STORAGE_DRIVER || "gcs",
  cdnBaseUrl: process.env.STORAGE_CDN_BASE_URL || "",
  local: {
    uploadDir: resolvePath(process.env.LOCAL_UPLOAD_DIR || defaultLocalRoot),
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
