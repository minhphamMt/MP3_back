import { Router } from "express";
import * as userController from "../controllers/user.controller.js";
import authMiddleware from "../middlewares/auth.middleware.js";
import rbacMiddleware from "../middlewares/rbac.middleware.js";
import ROLES from "../constants/roles.js";

const router = Router();

router.use(authMiddleware);

router.get("/me", userController.getCurrentUser);
router.put("/me", userController.updateProfile);
router.patch("/me/password", userController.updatePassword);

router.get("/", rbacMiddleware(ROLES.ADMIN), userController.listUsers);
router.get("/:id", rbacMiddleware(ROLES.ADMIN), userController.getUser);
router.put("/:id", rbacMiddleware(ROLES.ADMIN), userController.updateUser);
router.delete("/:id", rbacMiddleware(ROLES.ADMIN), userController.removeUser);
router.patch(
  "/:id/active",
  rbacMiddleware(ROLES.ADMIN),
  userController.toggleActive
);

export default router;
