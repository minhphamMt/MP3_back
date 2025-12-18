import { Router } from "express";
import * as analyticsController from "../controllers/analytics.controller.js";

const router = Router();

router.get("/songs", analyticsController.getTopSongs);
router.get("/artists", analyticsController.getTopArtists);
router.get("/genres", analyticsController.getTopGenres);

export default router;
