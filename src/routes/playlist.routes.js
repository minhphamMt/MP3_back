import { Router } from "express";
import * as playlistController from "../controllers/playlist.controller.js";
import authMiddleware from "../middlewares/auth.middleware.js";

const router = Router();

router.use(authMiddleware);

router.get("/", playlistController.getPlaylists);
router.post("/", playlistController.createPlaylistHandler);
router.get("/:id", playlistController.getPlaylist);
router.put("/:id", playlistController.updatePlaylistHandler);
router.delete("/:id", playlistController.deletePlaylistHandler);
router.post("/:id/songs", playlistController.addSong);
router.delete("/:id/songs/:songId", playlistController.removeSong);
router.patch("/:id/songs/:songId/reorder", playlistController.reorderSong);

export default router;
