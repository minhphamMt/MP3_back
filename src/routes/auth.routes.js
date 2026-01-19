import { Router } from "express";
import * as authController from "../controllers/auth.controller.js";
import validate from "../middlewares/validate.middleware.js";
import {
  firebaseLoginSchema,
  loginSchema,
  refreshSchema,
  registerSchema,
} from "../validations/auth.schema.js";

const router = Router();

router.post("/register", validate(registerSchema), authController.register);
router.post("/firebase", validate(firebaseLoginSchema), authController.firebaseLogin);
router.post("/login", validate(loginSchema), authController.login);
router.post("/refresh", validate(refreshSchema), authController.refresh);

export default router;