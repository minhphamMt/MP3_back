import { Router } from "express";
import { getSimilarSongsHandler } from "../controllers/song-recommendation.controller.js";

const router = Router();

// GET /api/recommend/:songId
router.get("/:songId", getSimilarSongsHandler);

export default router;