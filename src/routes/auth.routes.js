import { Router } from "express";
import * as authController from "../controllers/auth.controller.js";
import validate from "../middlewares/validate.middleware.js";
import {
  firebaseLoginSchema,
  forgotPasswordSchema,
  loginSchema,
  refreshSchema,
  registerSchema,
  resetPasswordSchema,
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
router.post(
  "/forgot-password",
  validate(forgotPasswordSchema),
  authController.forgotPassword
);
router.post(
  "/reset-password",
  validate(resetPasswordSchema),
  authController.confirmResetPassword
);

export default router;
