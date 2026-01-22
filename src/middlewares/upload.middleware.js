import multer from "multer";
import path from "path";
import fs from "fs";

const userAvatarDir = path.join(process.cwd(), "uploads/user/avatar");
const artistAvatarDir = path.join(process.cwd(), "uploads/images");
const songAudioDir = path.join(process.cwd(), "uploads/music");

const songCoverDir = path.join(process.cwd(), "uploads/songs");

[userAvatarDir, artistAvatarDir, songAudioDir, songCoverDir].forEach((dir) => {
  fs.mkdirSync(dir, { recursive: true });
});

const createStorage = ({ destination, filenamePrefix, resolveUserId }) =>
  multer.diskStorage({
    destination(req, file, cb) {
      cb(null, destination);
    },
    filename(req, file, cb) {
      const ext = path.extname(file.originalname);
      const ownerId = resolveUserId ? resolveUserId(req) : req.user?.id;
      const name = `${filenamePrefix}-${ownerId || "unknown"}-${Date.now()}${ext}`;
      cb(null, name);
    },
  });

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

export const uploadAvatar = multer({
  storage: createStorage({
    destination: userAvatarDir,
    filenamePrefix: "avatar",
  }),
  fileFilter: imageFileFilter,
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB
}).single("avatar");

export const uploadAdminUserAvatar = multer({
  storage: createStorage({
    destination: userAvatarDir,
    filenamePrefix: "avatar",
    resolveUserId: (req) => req.params.id,
  }),
  fileFilter: imageFileFilter,
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB
}).single("avatar");

export const uploadArtistAvatar = multer({
  storage: createStorage({
    destination: artistAvatarDir,
    filenamePrefix: "artist-avatar",
  }),
  fileFilter: imageFileFilter,
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB
}).single("avatar");

export const uploadSongAudio = multer({
  storage: createStorage({
    destination: songAudioDir,
    filenamePrefix: "song-audio",
  }),
  fileFilter: audioFileFilter,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
}).single("audio");
const songMediaStorage = multer.diskStorage({
  destination(req, file, cb) {
    if (file.fieldname === "audio") {
      return cb(null, songAudioDir);
    }
    if (file.fieldname === "cover") {
      return cb(null, songCoverDir);
    }
    return cb(new Error("Unsupported field"), null);
  },
  filename(req, file, cb) {
    const ext = path.extname(file.originalname);
    const prefix = file.fieldname === "audio" ? "song-audio" : "song-cover";
    const name = `${prefix}-${req.user.id}-${Date.now()}${ext}`;
    cb(null, name);
  },
});

const songMediaFilter = (req, file, cb) => {
  if (file.fieldname === "audio") {
    return audioFileFilter(req, file, cb);
  }
  if (file.fieldname === "cover") {
    return imageFileFilter(req, file, cb);
  }
  return cb(new Error("Unsupported field"), false);
};

export const uploadSongMedia = multer({
  storage: songMediaStorage,
  fileFilter: songMediaFilter,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
}).fields([
  { name: "audio", maxCount: 1 },
  { name: "cover", maxCount: 1 },
]);

const albumCoverDir = path.join(process.cwd(), "uploads/albums");

[albumCoverDir].forEach((dir) => {
  fs.mkdirSync(dir, { recursive: true });
});

export const uploadAlbumCover = multer({
  storage: createStorage({
    destination: albumCoverDir,
    filenamePrefix: "album-cover",
  }),
  fileFilter: imageFileFilter,
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB
}).single("cover");

export const uploadSongCover = multer({
  storage: createStorage({
    destination: songCoverDir,
    filenamePrefix: "song-cover",
  }),
  fileFilter: imageFileFilter,
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB
}).single("cover");