import { Router } from "express";
import * as songController from "../controllers/song.controller.js";
import authMiddleware from "../middlewares/auth.middleware.js";

const router = Router();

router.get("/", songController.getSongs);
router.get("/:id", songController.getSong);
router.get("/:id/stats", songController.getSongEngagement);
router.post("/:id/like", authMiddleware, songController.likeSongHandler);
router.delete("/:id/like", authMiddleware, songController.unlikeSongHandler);
router.post("/:id/play", songController.recordPlay);

export default router;
