import { Router } from "express";
import * as songController from "../controllers/song.controller.js";

const router = Router();

router.get("/", songController.getSongs);
router.get("/:id", songController.getSong);

export default router;
