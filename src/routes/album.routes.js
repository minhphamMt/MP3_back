import { Router } from "express";
import * as albumController from "../controllers/album.controller.js";
import authMiddleware from "../middlewares/auth.middleware.js";
import rbacMiddleware from "../middlewares/rbac.middleware.js";
import ROLES from "../constants/roles.js";
import {
  likeAlbumHandler,
  unlikeAlbumHandler,
  uploadAlbumCoverHandler,
} from "../controllers/album.controller.js";
import { uploadAlbumCover } from "../middlewares/upload.middleware.js";
const router = Router();
// Public routes
router.get("/", albumController.getAlbums);
router.get("/:id", albumController.getAlbum);
// Like and Unlike album
router.post("/:id/like", authMiddleware, likeAlbumHandler);
router.delete("/:id/like", authMiddleware, unlikeAlbumHandler);

router.post(
  "/",
  authMiddleware,
 rbacMiddleware(ROLES.ADMIN, ROLES.ARTIST),
 uploadAlbumCover,
  albumController.createAlbumHandler
);
router.put(
  "/:id",
  authMiddleware,
 rbacMiddleware(ROLES.ADMIN, ROLES.ARTIST),
 uploadAlbumCover,
  albumController.updateAlbumHandler
);
router.delete(
  "/:id",
  authMiddleware,
  rbacMiddleware(ROLES.ADMIN, ROLES.ARTIST),
  albumController.deleteAlbumHandler
);
router.post(
  "/:id/cover",
  authMiddleware,
  rbacMiddleware(ROLES.ADMIN, ROLES.ARTIST),
  uploadAlbumCover,
  uploadAlbumCoverHandler
);

export default router;
