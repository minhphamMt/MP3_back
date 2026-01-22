import { Router } from "express";
import * as userController from "../controllers/user.controller.js";
import * as followController from "../controllers/artist-follow.controller.js";
import authMiddleware from "../middlewares/auth.middleware.js";
import rbacMiddleware from "../middlewares/rbac.middleware.js";
import ROLES from "../constants/roles.js";
import { getMyLikedAlbums } from "../controllers/user.controller.js";
import { uploadAdminUserAvatar, uploadAvatar } from "../middlewares/upload.middleware.js";
import {
  uploadAvatar as uploadAvatarController,
  uploadUserAvatarByAdmin,
} from "../controllers/user.controller.js";
const router = Router();

router.use(authMiddleware);
// Current user routes
router.get("/me", userController.getCurrentUser);
router.put("/me", userController.updateProfile);
router.get("/me/liked-songs", authMiddleware, userController.getMyLikedSongs);
router.patch("/me/password", userController.updatePassword);
router.post(
  "/me/avatar",
  authMiddleware,
  uploadAvatar,
  uploadAvatarController
);
// Liked albums
router.get("/me/liked-albums", authMiddleware, getMyLikedAlbums);
router.get(
  "/me/followed-artists",
  followController.getMyFollowedArtists
);
// Admin routes
router.get("/", rbacMiddleware(ROLES.ADMIN), userController.listUsers);
router.post("/", rbacMiddleware(ROLES.ADMIN), userController.createUserByAdmin);
router.get("/:id", rbacMiddleware(ROLES.ADMIN), userController.getUser);
router.put("/:id", rbacMiddleware(ROLES.ADMIN), userController.updateUser);
router.delete("/:id", rbacMiddleware(ROLES.ADMIN), userController.removeUser);
router.post(
  "/:id/avatar",
  rbacMiddleware(ROLES.ADMIN),
  uploadAdminUserAvatar,
  uploadUserAvatarByAdmin
);
router.patch(
  "/:id/active",
  rbacMiddleware(ROLES.ADMIN),
  userController.toggleActive
);

export default router;
