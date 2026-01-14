import multer from "multer";
import path from "path";
import fs from "fs";

const userAvatarDir = path.join(process.cwd(), "uploads/user/avatar");
const artistAvatarDir = path.join(process.cwd(), "uploads/images");
const songAudioDir = path.join(process.cwd(), "uploads/music");

[userAvatarDir, artistAvatarDir, songAudioDir].forEach((dir) => {
  fs.mkdirSync(dir, { recursive: true });
});

const createStorage = ({ destination, filenamePrefix }) =>
  multer.diskStorage({
    destination(req, file, cb) {
      cb(null, destination);
    },
    filename(req, file, cb) {
      const ext = path.extname(file.originalname);
      const name = `${filenamePrefix}-${req.user.id}-${Date.now()}${ext}`;
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