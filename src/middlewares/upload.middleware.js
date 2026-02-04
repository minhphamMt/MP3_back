import multer from "multer";

const imageFileFilter = (req, file, cb) => {
  if (!file.mimetype.startsWith("image/")) {
    return cb(new Error("Only image files allowed"), false);
  }
  cb(null, true);
};

const audioFileFilter = (req, file, cb) => {
  if (!file.mimetype.startsWith("audio/")) {
    return cb(new Error("Only audio files allowed"), false);
  }
  cb(null, true);
};

const memoryStorage = multer.memoryStorage();

const createUploader = ({ fileFilter, limits }) =>
  multer({
    storage: memoryStorage,
    fileFilter,
    limits,
  });

export const uploadAvatar = createUploader({
  fileFilter: imageFileFilter,
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB
}).single("avatar");

export const uploadAdminUserAvatar = createUploader({
  fileFilter: imageFileFilter,
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB
}).single("avatar");

export const uploadArtistAvatar = createUploader({
  fileFilter: imageFileFilter,
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB
}).single("avatar");

export const uploadSongAudio = createUploader({
  fileFilter: audioFileFilter,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
}).single("audio");

const songMediaFilter = (req, file, cb) => {
  if (file.fieldname === "audio") {
    return audioFileFilter(req, file, cb);
  }
  if (file.fieldname === "cover") {
    return imageFileFilter(req, file, cb);
  }
  return cb(new Error("Unsupported field"), false);
};

export const uploadSongMedia = createUploader({
  fileFilter: songMediaFilter,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
}).fields([
  { name: "audio", maxCount: 1 },
  { name: "cover", maxCount: 1 },
]);

export const uploadAlbumCover = createUploader({
  fileFilter: imageFileFilter,
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB
}).single("cover");

export const uploadSongCover = createUploader({
  fileFilter: imageFileFilter,
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB
}).single("cover");
