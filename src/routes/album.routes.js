import { Router } from "express";
import * as albumController from "../controllers/album.controller.js";
import authMiddleware from "../middlewares/auth.middleware.js";
import rbacMiddleware from "../middlewares/rbac.middleware.js";
import ROLES from "../constants/roles.js";

const router = Router();

router.get("/", albumController.getAlbums);
router.get("/:id", albumController.getAlbum);
router.post(
  "/",
  authMiddleware,
  rbacMiddleware(ROLES.ADMIN),
  albumController.createAlbumHandler
);
router.put(
  "/:id",
  authMiddleware,
  rbacMiddleware(ROLES.ADMIN),
  albumController.updateAlbumHandler
);
router.delete(
  "/:id",
  authMiddleware,
  rbacMiddleware(ROLES.ADMIN),
  albumController.deleteAlbumHandler
);

export default router;
