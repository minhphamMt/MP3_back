import { Router } from "express";
import * as artistController from "../controllers/artist.controller.js";
import * as followController from "../controllers/artist-follow.controller.js";
import authMiddleware from "../middlewares/auth.middleware.js";
import rbacMiddleware from "../middlewares/rbac.middleware.js";
import ROLES from "../constants/roles.js";
import { uploadArtistAvatar } from "../middlewares/upload.middleware.js";

const router = Router();
//Public routes
router.get("/", artistController.getArtists);
router.get("/collections", artistController.getArtistCollections);
router.get("/me", authMiddleware, artistController.getMyArtistProfile);
router.post(
  "/me/avatar",
  authMiddleware,
  rbacMiddleware(ROLES.ADMIN, ROLES.ARTIST),
  uploadArtistAvatar,
  artistController.uploadArtistAvatar
);
router.get("/:id", artistController.getArtist);
//User routes
router.post(
  "/:id/follow",
  authMiddleware,
  followController.follow
);

router.delete(
  "/:id/follow",
  authMiddleware,
  followController.unfollow
);
//ADMIN routes
router.post(
  "/",
  authMiddleware,
  rbacMiddleware(ROLES.ADMIN, ROLES.ARTIST),
  uploadArtistAvatar,
  artistController.createArtistHandler
);
router.put(
  "/:id",
  authMiddleware,
   rbacMiddleware(ROLES.ADMIN, ROLES.ARTIST),
   uploadArtistAvatar,
  artistController.updateArtistHandler
);
router.delete(
  "/:id",
  authMiddleware,
  rbacMiddleware(ROLES.ADMIN, ROLES.ARTIST),
  artistController.deleteArtistHandler
);

export default router;
