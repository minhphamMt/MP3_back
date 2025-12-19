import { Router } from "express";
import * as artistController from "../controllers/artist.controller.js";
import authMiddleware from "../middlewares/auth.middleware.js";
import rbacMiddleware from "../middlewares/rbac.middleware.js";
import ROLES from "../constants/roles.js";

const router = Router();

router.get("/", artistController.getArtists);
router.get("/:id", artistController.getArtist);
router.post(
  "/",
  authMiddleware,
  rbacMiddleware(ROLES.ADMIN),
  artistController.createArtistHandler
);
router.put(
  "/:id",
  authMiddleware,
  rbacMiddleware(ROLES.ADMIN),
  artistController.updateArtistHandler
);
router.delete(
  "/:id",
  authMiddleware,
  rbacMiddleware(ROLES.ADMIN),
  artistController.deleteArtistHandler
);

export default router;
