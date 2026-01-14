import { Router } from "express";
import * as songController from "../controllers/song.controller.js";
import authMiddleware from "../middlewares/auth.middleware.js";
import rbacMiddleware from "../middlewares/rbac.middleware.js";
import ROLES from "../constants/roles.js";
import { getLikedSongss } from "../controllers/song.controller.js";
const router = Router();

router.get("/", songController.getSongs);
router.get("/art", songController.getSongsByArtist);
router.get("/liked", authMiddleware, songController.getLikedSongss);
router.get("/:id", songController.getSong);
router.get("/:id/stats", songController.getSongEngagement);
router.post(
  "/",
  authMiddleware,
  rbacMiddleware(ROLES.ADMIN, ROLES.ARTIST),
  songController.createSongHandler
);
router.put(
  "/:id",
  authMiddleware,
  rbacMiddleware(ROLES.ADMIN, ROLES.ARTIST),
  songController.updateSongHandler
);
router.delete(
  "/:id",
  authMiddleware,
  rbacMiddleware(ROLES.ADMIN  , ROLES.ARTIST),
  songController.deleteSongHandler
);
router.post("/:id/like", authMiddleware, songController.likeSongHandler);
router.delete("/:id/like", authMiddleware, songController.unlikeSongHandler);
router.post("/:id/play", authMiddleware, songController.recordPlay);

export default router;
