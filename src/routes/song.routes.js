import { Router } from "express";
import * as songController from "../controllers/song.controller.js";
import authMiddleware from "../middlewares/auth.middleware.js";
import optionalAuthMiddleware from "../middlewares/optionalAuth.middleware.js";
import ROLES from "../constants/roles.js";
import { getLikedSongss } from "../controllers/song.controller.js";
import {
  uploadSongAudio as uploadSongAudioFile,
  uploadSongCover,
  uploadSongMedia,
} from "../middlewares/upload.middleware.js";
import rbacMiddleware from "../middlewares/rbac.middleware.js";
import { getSongLyrics } from "../controllers/lyrics.controller.js";
const router = Router();

router.get("/", optionalAuthMiddleware, songController.getSongs);
router.get("/art", optionalAuthMiddleware, songController.getSongsByArtist);
router.get("/liked", authMiddleware, songController.getLikedSongss);
router.get("/:id/lyrics", optionalAuthMiddleware, getSongLyrics);
router.get("/:id", optionalAuthMiddleware, songController.getSong);
router.get("/:id/stats", songController.getSongEngagement);
router.post(
  "/",
  authMiddleware,
  rbacMiddleware(ROLES.ADMIN, ROLES.ARTIST),
  uploadSongMedia,
  songController.createSongHandler
);
router.put(
  "/:id",
  authMiddleware,
  rbacMiddleware(ROLES.ADMIN, ROLES.ARTIST),
  uploadSongMedia,
  songController.updateSongHandler
);
router.post(
  "/:id/audio",
  authMiddleware,
  rbacMiddleware(ROLES.ADMIN, ROLES.ARTIST),
  uploadSongAudioFile,
  songController.uploadSongAudio
);
router.post(
  "/:id/cover",
  authMiddleware,
  rbacMiddleware(ROLES.ADMIN, ROLES.ARTIST),
  uploadSongCover,
  songController.uploadSongCover
);
router.delete(
  "/:id",
  authMiddleware,
  rbacMiddleware(ROLES.ADMIN  , ROLES.ARTIST),
  songController.deleteSongHandler
);
router.patch(
  "/:id/restore",
  authMiddleware,
  rbacMiddleware(ROLES.ADMIN, ROLES.ARTIST),
  songController.restoreSongHandler
);
router.post("/:id/like", authMiddleware, songController.likeSongHandler);
router.delete("/:id/like", authMiddleware, songController.unlikeSongHandler);
router.post("/:id/play", authMiddleware, songController.recordPlay);

export default router;
