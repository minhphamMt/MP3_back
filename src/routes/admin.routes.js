import { Router } from "express";
import * as adminController from "../controllers/admin.controller.js";
import authMiddleware from "../middlewares/auth.middleware.js";
import rbacMiddleware from "../middlewares/rbac.middleware.js";
import ROLES from "../constants/roles.js";

const router = Router();

router.use(authMiddleware, rbacMiddleware(ROLES.ADMIN));

router.patch("/songs/:id/review", adminController.reviewSongRequest);
router.patch("/users/:id/active", adminController.toggleUserActive);

export default router;
