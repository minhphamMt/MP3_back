import { Router } from "express";
import * as albumController from "../controllers/album.controller.js";

const router = Router();

router.get("/", albumController.getAlbums);
router.get("/:id", albumController.getAlbum);

export default router;
