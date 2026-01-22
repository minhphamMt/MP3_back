import { Router } from "express";
import authMiddleware from "../middlewares/auth.middleware.js";
import rbacMiddleware from "../middlewares/rbac.middleware.js";
import ROLES from "../constants/roles.js";
import { getDeletedItems } from "../controllers/trash.controller.js";

const router = Router();

router.get(
  "/",
  authMiddleware,
  rbacMiddleware(ROLES.ADMIN, ROLES.ARTIST),
  getDeletedItems
);

export default router;