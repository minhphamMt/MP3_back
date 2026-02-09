import { Router } from "express";
import * as adminController from "../controllers/admin.controller.js";
import authMiddleware from "../middlewares/auth.middleware.js";
import rbacMiddleware from "../middlewares/rbac.middleware.js";
import ROLES from "../constants/roles.js";
import { uploadSongMedia } from "../middlewares/upload.middleware.js";

const router = Router();

router.use(authMiddleware, rbacMiddleware(ROLES.ADMIN));

router.get("/reports/overview", adminController.getReportOverview);
router.get("/search", adminController.searchAdmin);
router.get("/genres", adminController.listGenresRequest);
router.post("/genres", adminController.createGenreRequest);
router.put("/genres/:id", adminController.updateGenreRequest);
router.delete("/genres/:id", adminController.deleteGenreRequest);
router.patch("/genres/:id/restore", adminController.restoreGenreRequest);
router.patch("/songs/:id/review", adminController.reviewSongRequest);
router.patch("/songs/:id/approve", adminController.approveSongRequest);
router.patch("/songs/:id/block", adminController.blockSongRequest);
router.get("/songs", adminController.listSongsRequest);
router.get("/songs/:id", adminController.getSongRequest);
router.put("/songs/:id", uploadSongMedia, adminController.updateSongRequest);
router.get("/artist-requests", adminController.listArtistRequestsRequest);
router.patch(
  "/artist-requests/:id/review",
  adminController.reviewArtistRequestHandler
);
router.patch(
  "/artist-requests/:id/approve",
  adminController.approveArtistRequest
);
router.patch(
  "/artist-requests/:id/reject",
  adminController.rejectArtistRequest
);
router.patch("/users/:id/active", adminController.toggleUserActive);
router.patch("/users/:id/role", adminController.updateUserRole);
router.patch("/users/:id", adminController.updateUserRequest);

export default router;
