import { Router } from "express";
import * as authController from "../controllers/auth.controller.js";
import validate from "../middlewares/validate.middleware.js";
import {
  firebaseLoginSchema,
  loginSchema,
  refreshSchema,
  registerSchema,
  resendVerificationSchema,
  verifyEmailSchema,
} from "../validations/auth.schema.js";

const router = Router();

router.post("/register", validate(registerSchema), authController.register);
router.post(
  "/artist/register",
  validate(registerSchema),
  authController.registerArtist
);
router.post(
  "/verify-email",
  validate(verifyEmailSchema),
  authController.verifyEmail
);
router.get("/verify-email/confirm", authController.verifyEmailFromLink);
router.post(
  "/resend-verification",
  validate(resendVerificationSchema),
  authController.resendVerification
);
router.post("/firebase", validate(firebaseLoginSchema), authController.firebaseLogin);
router.post("/login", validate(loginSchema), authController.login);
router.post("/artist/login", validate(loginSchema), authController.loginArtist);
router.post("/refresh", validate(refreshSchema), authController.refresh);

export default router;
