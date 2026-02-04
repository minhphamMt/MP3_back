import fs from "fs";
import path from "path";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Storage } from "@google-cloud/storage";
import storageConfig from "../config/upload.js";

const ensureDirectory = async (dirPath) =>
  fs.promises.mkdir(dirPath, { recursive: true });

const buildKey = ({ resourceType, mediaType, fileName }) => {
  const sanitized = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
  const timestamp = Date.now();
  return path.posix.join(resourceType, mediaType, `${timestamp}-${sanitized}`);
};

const buildPublicUrl = (key) => {
  if (storageConfig.cdnBaseUrl) {
    return `${storageConfig.cdnBaseUrl.replace(/\/$/, "")}/${key}`;
  }

  if (storageConfig.driver === "local") {
    const normalizedBase = storageConfig.local.baseUrl.replace(/\/$/, "");
    return `${normalizedBase}/${key}`.replace(/\/+/g, "/");
  }

  if (storageConfig.driver === "s3") {
    return `https://${storageConfig.s3.bucket}.s3.${storageConfig.s3.region}.amazonaws.com/${key}`;
  }

  if (storageConfig.driver === "gcs") {
    return `https://storage.googleapis.com/${storageConfig.gcs.bucket}/${key}`;
  }

  return key;
};

let s3Client;
let gcsClient;

if (storageConfig.driver === "s3") {
  s3Client = new S3Client({
    region: storageConfig.s3.region,
    credentials: {
      accessKeyId: storageConfig.s3.accessKeyId,
      secretAccessKey: storageConfig.s3.secretAccessKey,
    },
  });
}

if (storageConfig.driver === "gcs") {
  gcsClient = new Storage({
    projectId: storageConfig.gcs.projectId,
    keyFilename: storageConfig.gcs.keyFilename,
  });
}

const normalizeKeyForDriver = (key) => {
  const trimmed = key.replace(/^\/+/, "");

  if (storageConfig.driver === "local" && trimmed.startsWith("uploads/")) {
    return trimmed.slice("uploads/".length);
  }

  return trimmed;
};

export const resolvePublicUrl = (value) => {
  if (!value) {
    return value;
  }

  if (/^https?:\/\//i.test(value)) {
    return value;
  }

  if (/^gs:\/\//i.test(value)) {
    return value;
  }

  const normalized = value.startsWith("/") ? value : `/${value}`;

  if (normalized.startsWith("/music/")) {
    const musicKey = path.posix.join(
      "uploads",
      "music",
      normalized.replace(/^\/music\//, "")
    );
    return buildPublicUrl(normalizeKeyForDriver(musicKey));
  }

  if (normalized.startsWith("/uploads/")) {
    return buildPublicUrl(normalizeKeyForDriver(normalized.replace(/^\/+/, "")));
  }

  return buildPublicUrl(normalizeKeyForDriver(normalized.replace(/^\/+/, "")));
};

export const generateFileName = ({ prefix, ownerId, originalName }) => {
  const ext = path.extname(originalName || "");
  const safeOwnerId = ownerId ?? "unknown";
  return `${prefix}-${safeOwnerId}-${Date.now()}${ext}`;
};

export const uploadMediaFile = async ({
  folder,
  file,
  prefix,
  ownerId,
}) => {
  if (!file) {
    return null;
  }

  const fileName = generateFileName({
    prefix,
    ownerId,
    originalName: file.originalname,
  });
  const key = path.posix.join(folder, fileName);

  const uploaded = await uploadBuffer({
    key,
    buffer: file.buffer,
    contentType: file.mimetype,
  });

  return {
    ...uploaded,
    fileName,
  };
};

export const uploadBuffer = async ({ key, buffer, contentType }) => {
  const normalizedKey = normalizeKeyForDriver(key);

  if (storageConfig.driver === "s3") {
    if (!storageConfig.s3.bucket || !storageConfig.s3.region) {
      throw new Error("S3 bucket and region are required for S3 storage");
    }

    await s3Client.send(
      new PutObjectCommand({
        Bucket: storageConfig.s3.bucket,
        Key: normalizedKey,
        Body: buffer,
        ContentType: contentType,
        ACL: "public-read",
      })
    );

    return {
      provider: "s3",
      path: normalizedKey,
      publicUrl: buildPublicUrl(normalizedKey),
    };
  }

  if (storageConfig.driver === "gcs") {
    if (!storageConfig.gcs.bucket || !storageConfig.gcs.projectId) {
      throw new Error("GCS bucket and projectId are required for GCS storage");
    }

    const bucket = gcsClient.bucket(storageConfig.gcs.bucket);
    const file = bucket.file(normalizedKey);

    await file.save(buffer, {
      resumable: false,
      contentType,
    });
    await file.makePublic();

    return {
      provider: "gcs",
      path: normalizedKey,
      publicUrl: buildPublicUrl(normalizedKey),
    };
  }

  const fullPath = path.join(storageConfig.local.uploadDir, normalizedKey);
  await ensureDirectory(path.dirname(fullPath));
  await fs.promises.writeFile(fullPath, buffer);

  return {
    provider: "local",
    path: normalizedKey,
    publicUrl: buildPublicUrl(normalizedKey),
  };
};

export const createUploadTarget = async ({
  resourceType,
  mediaType,
  fileName,
  contentType,
}) => {
  if (!resourceType || !mediaType || !fileName) {
    throw new Error("resourceType, mediaType and fileName are required");
  }

  const key = buildKey({ resourceType, mediaType, fileName });

  if (storageConfig.driver === "s3") {
    if (!storageConfig.s3.bucket || !storageConfig.s3.region) {
      throw new Error("S3 bucket and region are required for S3 storage");
    }

    const command = new PutObjectCommand({
      Bucket: storageConfig.s3.bucket,
      Key: key,
      ContentType: contentType,
    });

    const uploadUrl = await getSignedUrl(s3Client, command, {
      expiresIn: storageConfig.s3.expiresIn,
    });

    return {
      provider: "s3",
      uploadUrl,
      path: key,
      publicUrl: buildPublicUrl(key),
    };
  }

  if (storageConfig.driver === "gcs") {
    if (!storageConfig.gcs.bucket || !storageConfig.gcs.projectId) {
      throw new Error("GCS bucket and projectId are required for GCS storage");
    }

    const bucket = gcsClient.bucket(storageConfig.gcs.bucket);
    const file = bucket.file(key);
    const [uploadUrl] = await file.getSignedUrl({
      version: "v4",
      action: "write",
      expires: Date.now() + storageConfig.gcs.expiresIn * 1000,
      contentType,
    });

    return {
      provider: "gcs",
      uploadUrl,
      path: key,
      publicUrl: buildPublicUrl(key),
    };
  }

  // local storage
  const fullPath = path.join(storageConfig.local.uploadDir, key);
  await ensureDirectory(path.dirname(fullPath));

  return {
    provider: "local",
    uploadUrl: fullPath,
    path: key,
    publicUrl: buildPublicUrl(key),
  };
};

export default {
  createUploadTarget,
  uploadBuffer,
  resolvePublicUrl,
  generateFileName,
};
